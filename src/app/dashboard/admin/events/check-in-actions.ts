'use server';

import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  applicationStatuses,
  checkIns,
  eventApplications,
  eventAttendees,
  events,
  user,
  userProfiles,
} from '@/db/schema';
import { requirePermission } from '@/lib/rbac/authorization';
import {
  verifyCheckInPayload,
  verifyCheckInToken,
  type CheckInClaims,
} from '@/lib/wallet/check-in-token';
import {
  getEventParticipation,
  resolveParticipantName,
} from '@/lib/wallet/participation';
import type { ApplicationStatus } from '@/types/lookups';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { writeAuditLog } from '@/utils/audit-log';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';

const APPROVED_STATUS: ApplicationStatus = 'approved';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CheckInOutcome = {
  userId: string;
  name: string;
  alreadyCheckedIn: boolean;
  /** ISO instant with `Z`. Never send a Date across the action boundary. */
  checkedInAt: string;
  /** America/Edmonton wall clock, formatted on the server. */
  checkedInAtLabel: string;
  checkedInByName: string | null;
};

export type CheckInRosterRow = {
  userId: string;
  name: string;
  email: string;
  /** ISO instant with `Z`, or null if they have not checked in. */
  checkedInAt: string | null;
  checkedInAtLabel: string | null;
  checkedInByName: string | null;
};

/** Wall clock in America/Edmonton, computed by Postgres — never by JS Date. */
const checkedInAtIsoSql = sql<string>`to_char(${checkIns.checkedInAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const checkedInAtLabelSql = sql<string>`trim(to_char(${checkIns.checkedInAt} AT TIME ZONE 'America/Edmonton', 'Mon FMDD, YYYY, FMHH12:MI AM')) || ' MT'`;

/**
 * Wallet passes encode the token as base64url text; the in-app QR encodes the
 * raw bytes. Both arrive base64url-encoded, so try the raw form first and then
 * the text form. Either way the Ed25519 check rejects a wrong guess.
 */
function readScannedToken(payload: string): CheckInClaims | null {
  const bytes = Buffer.from(payload, 'base64url');
  if (bytes.length === 0) return null;

  return (
    verifyCheckInToken(bytes) ??
    verifyCheckInPayload(bytes.toString('latin1').trim())
  );
}

async function getScanner() {
  const actor = await getUser();
  if (!actor) return null;
  await requirePermission(actor.id, 'checkin:write:all');
  return actor;
}

async function loadAccountName(userId: string): Promise<string> {
  const [row] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.name ?? '';
}

/**
 * Relies on the (user_id, event_id) unique index to decide whether this scan
 * is the first, so simultaneous scans can't both be told they were.
 * Returns null if the conflicting row was deleted before it could be read.
 */
async function recordCheckIn(
  eventId: string,
  userId: string,
  actorId: string,
): Promise<Omit<CheckInOutcome, 'userId' | 'name'> | null> {
  const [inserted] = await db
    .insert(checkIns)
    .values({ eventId, userId, checkedInBy: actorId })
    .onConflictDoNothing({ target: [checkIns.userId, checkIns.eventId] })
    .returning({
      checkedInAt: checkedInAtIsoSql,
      checkedInAtLabel: checkedInAtLabelSql,
    });

  if (inserted) {
    return {
      alreadyCheckedIn: false,
      checkedInAt: inserted.checkedInAt,
      checkedInAtLabel: inserted.checkedInAtLabel,
      checkedInByName: null,
    };
  }

  const scanner = alias(user, 'scanner');
  const [existing] = await db
    .select({
      checkedInAt: checkedInAtIsoSql,
      checkedInAtLabel: checkedInAtLabelSql,
      scannerName: scanner.name,
    })
    .from(checkIns)
    .leftJoin(scanner, eq(scanner.id, checkIns.checkedInBy))
    .where(and(eq(checkIns.eventId, eventId), eq(checkIns.userId, userId)))
    .limit(1);

  if (!existing) return null;

  return {
    alreadyCheckedIn: true,
    checkedInAt: existing.checkedInAt,
    checkedInAtLabel: existing.checkedInAtLabel,
    checkedInByName: existing.scannerName,
  };
}

async function checkInUser(
  eventId: string,
  userId: string,
  actorId: string,
): Promise<ActionResult<CheckInOutcome>> {
  const participation = await getEventParticipation(eventId, userId);
  if (!participation) {
    return fail('Check-in is only available for main events.');
  }
  if (!participation.isParticipant) {
    return fail('This person is not registered for this event.');
  }

  const name = resolveParticipantName(
    participation.fullName,
    await loadAccountName(userId),
  );

  const recorded = await recordCheckIn(eventId, userId, actorId);
  if (!recorded) {
    return fail('That check-in was just undone. Scan again to redo it.');
  }

  if (!recorded.alreadyCheckedIn) {
    await writeAuditLog({
      actorId,
      action: 'checkin.create',
      targetType: 'user',
      targetId: userId,
      metadata: { eventId },
    });
  }

  return ok({ userId, name, ...recorded });
}

/**
 * Checks a participant in from their pass QR code.
 * Requires checkin:write:all permission.
 */
export async function scanCheckIn(
  eventId: string,
  payload: string,
): Promise<ActionResult<CheckInOutcome>> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');

  const claims = readScannedToken(payload);
  if (!claims) return fail('This is not a valid MRUHacks pass.');

  if (claims.eventId !== eventId) {
    return fail('This pass was issued for a different event.');
  }
  if (claims.expiresAt.getTime() < Date.now()) {
    return fail('This pass has expired. Check them in by name instead.');
  }

  return checkInUser(eventId, claims.userId, actor.id);
}

/**
 * Checks a participant in by hand, without a scannable pass.
 * Requires checkin:write:all permission.
 */
export async function checkInParticipant(
  eventId: string,
  userId: string,
): Promise<ActionResult<CheckInOutcome>> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  if (!UUID_PATTERN.test(userId)) return fail('Unknown participant.');

  return checkInUser(eventId, userId, actor.id);
}

/**
 * Removes a check-in recorded in error, leaving only the audit log entry.
 * Requires checkin:write:all permission.
 */
export async function undoCheckIn(
  eventId: string,
  userId: string,
): Promise<ActionResult> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  if (!UUID_PATTERN.test(userId)) return fail('Unknown participant.');

  const [removed] = await db
    .delete(checkIns)
    .where(and(eq(checkIns.eventId, eventId), eq(checkIns.userId, userId)))
    .returning({ checkedInAt: checkIns.checkedInAt });

  if (!removed) return fail('They were not checked in.');

  await writeAuditLog({
    actorId: actor.id,
    action: 'checkin.undo',
    targetType: 'user',
    targetId: userId,
    metadata: { eventId, checkedInAt: removed.checkedInAt.toISOString() },
  });

  return ok();
}

/**
 * Lists everyone eligible to attend the event, checked in or not.
 * Requires checkin:write:all permission.
 */
export async function getCheckInRoster(
  eventId: string,
): Promise<ActionResult<CheckInRosterRow[]>> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  if (!UUID_PATTERN.test(eventId)) return fail('Event not found.');

  const [topLevelEvent] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.parentEventId)))
    .limit(1);
  if (!topLevelEvent) {
    return fail('Check-in is only available for main events.');
  }

  const scanner = alias(user, 'scanner');

  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      accountName: user.name,
      fullName: userProfiles.fullName,
      checkedInAt: checkedInAtIsoSql,
      checkedInAtLabel: checkedInAtLabelSql,
      scannerName: scanner.name,
    })
    .from(user)
    .leftJoin(
      eventApplications,
      and(
        eq(eventApplications.eventId, eventId),
        eq(eventApplications.userId, user.id),
      ),
    )
    .leftJoin(
      applicationStatuses,
      eq(applicationStatuses.id, eventApplications.statusId),
    )
    .leftJoin(
      eventAttendees,
      and(
        eq(eventAttendees.eventId, eventId),
        eq(eventAttendees.userId, user.id),
      ),
    )
    .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
    .leftJoin(
      checkIns,
      and(eq(checkIns.eventId, eventId), eq(checkIns.userId, user.id)),
    )
    .leftJoin(scanner, eq(scanner.id, checkIns.checkedInBy))
    .where(
      or(
        isNotNull(eventAttendees.userId),
        eq(applicationStatuses.label, APPROVED_STATUS),
      ),
    );

  return ok(
    rows.map((row) => ({
      userId: row.userId,
      name: resolveParticipantName(row.fullName, row.accountName),
      email: row.email,
      checkedInAt: row.checkedInAt,
      checkedInAtLabel: row.checkedInAtLabel,
      checkedInByName: row.scannerName,
    })),
  );
}
