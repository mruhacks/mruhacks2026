'use server';

import { updateTag } from 'next/cache';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import {
  checkIns,
  eventParticipants,
  events,
  user,
  userProfiles,
} from '@/db/schema';
import { eventApplicationsCacheTag } from '@/lib/admin-event';
import { parseInstant } from '@/lib/datetime';
import {
  isSubeventRunning,
  resolveCheckInTarget,
  type CheckInTarget,
} from '@/lib/subevents';
import { hasPermission, requirePermission } from '@/lib/rbac/authorization';
import { verifyCheckInPayload } from '@/lib/wallet/check-in-token';
import {
  getEventParticipation,
  resolveParticipantName,
} from '@/lib/wallet/participation';
import { hasStatus } from '@/lib/participation/server';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { writeAuditLog } from '@/utils/audit-log';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';

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
  /**
   * The sub-event this check-in was recorded against, or null for the door.
   * Echoed back so the scan result can name it — a scanner left armed on the
   * wrong sub-event records perfectly valid-looking rows, and reading the
   * target back on the very first scan is what catches that.
   */
  targetName: string | null;
};

export type CheckInRosterRow = {
  userId: string;
  name: string;
  email: string;
  /** ISO instant with `Z`, or null if they have not checked in. */
  checkedInAt: string | null;
  checkedInAtLabel: string | null;
  checkedInByName: string | null;
  /**
   * Whether they have a check-in against the *main* event — i.e. whether they
   * actually turned up. On a main-event roster this is the same fact as
   * `checkedInAt` and goes unread; on a sub-event roster it is what lets the
   * desk show *why* someone isn't checkable yet, instead of leaving a
   * volunteer to discover it by tapping.
   */
  atMainEvent: boolean;
};

/** The check-in half of a roster row — everything a poll can change. */
export type CheckInPatch = {
  userId: string;
  /** ISO instant with `Z`. */
  checkedInAt: string;
  checkedInAtLabel: string;
  checkedInByName: string | null;
};

export type CheckInUpdates = {
  /** Check-ins recorded after the caller's watermark. */
  changed: CheckInPatch[];
  /** Every check-in the event has right now. The caller compares this to
   *  what it holds after applying `changed`: a shortfall means a row was
   *  undone, which no watermark can describe, so it reloads in full. */
  checkedInCount: number;
};

/** Wall clock in America/Edmonton, computed by Postgres — never by JS Date. */
const checkedInAtIsoSql = sql<string>`to_char(${checkIns.checkedInAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const checkedInAtLabelSql = sql<string>`trim(to_char(${checkIns.checkedInAt} AT TIME ZONE 'America/Edmonton', 'Mon FMDD, YYYY, FMHH12:MI AM')) || ' MT'`;

async function getScanner() {
  const actor = await getUser();
  if (!actor) return null;
  await requirePermission(actor.id, 'checkin:write:all');
  return actor;
}

async function isCheckInEnabled(
  eventId: string,
  targetEventId?: string | null,
) {
  if (!UUID_PATTERN.test(eventId)) return false;
  const [main] = await db
    .select({ enabled: events.checkInEnabled })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.parentEventId)))
    .limit(1);
  if (main && !main.enabled) return false;
  if (!targetEventId || targetEventId.toLowerCase() === eventId.toLowerCase())
    return true;
  if (!UUID_PATTERN.test(targetEventId)) return false;
  const [target] = await db
    .select({ enabled: events.checkInEnabled })
    .from(events)
    .where(and(eq(events.id, targetEventId), eq(events.parentEventId, eventId)))
    .limit(1);
  // The target resolver reports missing/foreign entries with its specific error.
  return target?.enabled ?? true;
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
 *
 * `eventId` is the event the row is written against — the main event at the
 * door, a sub-event at a meal or workshop — while `mainEventId` is only there
 * to invalidate the right dashboard.
 */
async function recordCheckIn(
  eventId: string,
  mainEventId: string,
  userId: string,
  actorId: string,
): Promise<Omit<CheckInOutcome, 'userId' | 'name' | 'targetName'> | null> {
  const [inserted] = await db
    .insert(checkIns)
    .values({ eventId, userId, checkedInBy: actorId })
    .onConflictDoNothing({ target: [checkIns.userId, checkIns.eventId] })
    .returning({
      checkedInAt: checkedInAtIsoSql,
      checkedInAtLabel: checkedInAtLabelSql,
    });

  // Moves the event dashboard's check-ins tile. Its getter is cached for
  // minutes, which is the right staleness for an overview but too slow for
  // the desk itself — the scanner keeps its own live polling.
  //
  // Always tagged against the main event, even for a sub-event check-in: the
  // tiles that count check-ins hang off the parent's dashboard.
  if (inserted) updateTag(eventApplicationsCacheTag(mainEventId));

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

/**
 * Records one check-in. `eventId` is always the *main* event — the one the pass
 * was issued for and the one participation is judged against — while `target`
 * says which event the row actually lands on.
 *
 * Note which event the freeze reads: `participation.endsAt` is the main event's
 * end, so a sub-event stays open for corrections after its own slot has passed
 * and closes only once the whole event is over. A meal line at 13:05 for a
 * 13:00 lunch is the normal case, not an error, and undo has to stay available
 * for exactly as long as check-in does.
 */
async function checkInUser(
  eventId: string,
  userId: string,
  actorId: string,
  target: CheckInTarget,
): Promise<ActionResult<CheckInOutcome>> {
  const participation = await getEventParticipation(eventId, userId);
  if (!participation) {
    return fail('Check-in is only available for main events.');
  }
  if (!participation.isParticipant) {
    return fail('This person is not registered for this event.');
  }
  if (participation.endsAt && participation.endsAt.getTime() < Date.now()) {
    return fail('This event has ended. Check-in is frozen.');
  }

  const name = resolveParticipantName(
    participation.fullName,
    await loadAccountName(userId),
  );

  // A sub-event is for people who are actually here, so the door comes first.
  // Read-then-write rather than an atomic insert-where-exists: the atomic form
  // can't tell "not at the door" apart from "already checked in" through
  // onConflictDoNothing, and the race it would close is benign — a door
  // check-in undone microseconds earlier, which the roster shows anyway.
  if (target.isSubevent) {
    const [atDoor] = await db
      .select({ userId: checkIns.userId })
      .from(checkIns)
      .where(and(eq(checkIns.eventId, eventId), eq(checkIns.userId, userId)))
      .limit(1);
    if (!atDoor) {
      return fail(
        `${name} has not checked in at the main event yet — check them in at the door first.`,
      );
    }
  }

  const recorded = await recordCheckIn(
    target.targetId,
    eventId,
    userId,
    actorId,
  );
  if (!recorded) {
    return fail('That check-in was just undone. Scan again to redo it.');
  }

  if (!recorded.alreadyCheckedIn) {
    await writeAuditLog({
      actorId,
      action: 'checkin.create',
      targetType: 'user',
      targetId: userId,
      metadata: target.isSubevent
        ? { eventId, subeventId: target.targetId }
        : { eventId },
    });
  }

  return ok({ userId, name, targetName: target.name, ...recorded });
}

/** The failure every action shares when a target isn't this event's sub-event. */
const UNKNOWN_TARGET = 'That schedule entry does not belong to this event.';

const TARGET_NOT_RUNNING =
  "That schedule entry isn't running right now, so it can't take check-ins.";

/**
 * Whether `actorId` may write against `target` at this moment. The door is
 * always open (until the event's end, checked separately); a schedule entry
 * only while it's running, unless the actor holds `checkin:override:all` —
 * which is what lets an organizer fix a missed scan after lunch has ended.
 *
 * Enforced here, not just by hiding the entry in the picker: the picker is a
 * convenience, and a stale tab or hand-edited `?target=` would otherwise walk
 * straight past it.
 */
async function canWriteToTarget(
  actorId: string,
  target: CheckInTarget,
): Promise<boolean> {
  if (!target.isSubevent || isSubeventRunning(target)) return true;
  return hasPermission(actorId, 'checkin:override:all');
}

/**
 * Checks a participant in from their pass QR code.
 *
 * `eventId` is the main event, which is what the pass encodes; `targetEventId`
 * optionally narrows the check-in to one of its sub-events. Passes are only
 * ever issued for a main event, so the token is deliberately still compared
 * against `eventId` and needs no new version.
 *
 * Requires checkin:write:all permission.
 */
export async function scanCheckIn(
  eventId: string,
  payload: string,
  targetEventId?: string | null,
): Promise<ActionResult<CheckInOutcome>> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');

  const claims = verifyCheckInPayload(payload);
  if (!claims) return fail('This is not a valid MRUHacks pass.');

  // The token's id comes back lowercase from bytesToUuid, while the route
  // param keeps whatever case the URL used — UUID_PATTERN accepts either, so
  // a mixed-case event URL would otherwise reject every valid pass.
  if (claims.eventId.toLowerCase() !== eventId.toLowerCase()) {
    return fail('This pass was issued for a different event.');
  }

  if (!(await isCheckInEnabled(eventId, targetEventId))) {
    return fail('Check-in is disabled for this event.');
  }

  const target = await resolveCheckInTarget(eventId, targetEventId);
  if (!target) return fail(UNKNOWN_TARGET);
  if (!(await canWriteToTarget(actor.id, target))) {
    return fail(TARGET_NOT_RUNNING);
  }

  return checkInUser(eventId, claims.userId, actor.id, target);
}

/**
 * Checks a participant in by hand, without a scannable pass.
 * Requires checkin:write:all permission.
 */
export async function checkInParticipant(
  eventId: string,
  userId: string,
  targetEventId?: string | null,
): Promise<ActionResult<CheckInOutcome>> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  if (!UUID_PATTERN.test(userId)) return fail('Unknown participant.');

  if (!(await isCheckInEnabled(eventId, targetEventId))) {
    return fail('Check-in is disabled for this event.');
  }

  const target = await resolveCheckInTarget(eventId, targetEventId);
  if (!target) return fail(UNKNOWN_TARGET);
  if (!(await canWriteToTarget(actor.id, target))) {
    return fail(TARGET_NOT_RUNNING);
  }

  return checkInUser(eventId, userId, actor.id, target);
}

/**
 * Removes a check-in recorded in error, leaving only the audit log entry.
 * Requires checkin:write:all permission.
 */
export async function undoCheckIn(
  eventId: string,
  userId: string,
  targetEventId?: string | null,
): Promise<ActionResult> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  // Both ids go straight into the delete's where clause, so a non-UUID would
  // reach Postgres and raise `invalid input syntax for type uuid` as an
  // unhandled action error rather than a fail() result.
  if (!UUID_PATTERN.test(eventId)) return fail('Event not found.');
  if (!UUID_PATTERN.test(userId)) return fail('Unknown participant.');

  if (!(await isCheckInEnabled(eventId, targetEventId))) {
    return fail('Check-in is disabled for this event.');
  }

  const target = await resolveCheckInTarget(eventId, targetEventId);
  if (!target) return fail(UNKNOWN_TARGET);
  if (!(await canWriteToTarget(actor.id, target))) {
    return fail(TARGET_NOT_RUNNING);
  }

  // The main event's end, deliberately, even when undoing a sub-event row —
  // undo has to stay available for exactly as long as check-in does, or a
  // mis-scan at a meal becomes permanent the moment that meal's slot passes.
  const [eventRow] = await db
    .select({ endsAt: events.endsAt })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!eventRow) return fail('Event not found.');
  if (eventRow.endsAt && eventRow.endsAt.getTime() < Date.now()) {
    return fail('This event has ended. Check-in is frozen.');
  }

  const [removed] = await db
    .delete(checkIns)
    .where(
      and(eq(checkIns.eventId, target.targetId), eq(checkIns.userId, userId)),
    )
    .returning({ checkedInAt: checkIns.checkedInAt });

  if (!removed) return fail('They were not checked in.');

  updateTag(eventApplicationsCacheTag(eventId));

  await writeAuditLog({
    actorId: actor.id,
    action: 'checkin.undo',
    targetType: 'user',
    targetId: userId,
    metadata: {
      eventId,
      ...(target.isSubevent ? { subeventId: target.targetId } : {}),
      checkedInAt: removed.checkedInAt.toISOString(),
    },
  });

  return ok();
}

/**
 * Lists everyone eligible to attend the event, checked in or not.
 * Requires checkin:write:all permission.
 */
export async function getCheckInRoster(
  eventId: string,
  targetEventId?: string | null,
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

  if (!(await isCheckInEnabled(eventId, targetEventId))) {
    return fail('Check-in is disabled for this event.');
  }

  const target = await resolveCheckInTarget(eventId, targetEventId);
  if (!target) return fail(UNKNOWN_TARGET);

  const scanner = alias(user, 'scanner');
  // Door check-ins, read separately from the target's own. A sub-event roster
  // lists the *main* event's population — a child has no applicants or
  // attendees of its own — so who is actually here has to come from the main
  // event's rows even while `checkedInAt` tracks the sub-event's.
  const doorCheckIns = alias(checkIns, 'door_check_ins');

  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      accountName: user.name,
      fullName: userProfiles.fullName,
      checkedInAt: checkedInAtIsoSql,
      checkedInAtLabel: checkedInAtLabelSql,
      scannerName: scanner.name,
      atMainEvent: sql<boolean>`${doorCheckIns.userId} IS NOT NULL`,
    })
    .from(user)
    // Everyone holding a spot — and nobody else. An invited applicant who
    // never accepted (or declined, or let their invitation expire) isn't
    // attending.
    .innerJoin(
      eventParticipants,
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.userId, user.id),
        hasStatus('accepted'),
      ),
    )
    .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
    .leftJoin(
      checkIns,
      and(eq(checkIns.eventId, target.targetId), eq(checkIns.userId, user.id)),
    )
    // Joined unconditionally rather than only for a sub-event: on a main target
    // it resolves to the very same row as the join above (the unique index
    // guarantees at most one), so it cannot fan out, and one code path beats a
    // dynamic query whose result type changes with the target.
    .leftJoin(
      doorCheckIns,
      and(eq(doorCheckIns.eventId, eventId), eq(doorCheckIns.userId, user.id)),
    )
    .leftJoin(scanner, eq(scanner.id, checkIns.checkedInBy));

  return ok(
    rows.map((row) => ({
      userId: row.userId,
      name: resolveParticipantName(row.fullName, row.accountName),
      email: row.email,
      checkedInAt: row.checkedInAt,
      checkedInAtLabel: row.checkedInAtLabel,
      checkedInByName: row.scannerName,
      atMainEvent: row.atMainEvent,
    })),
  );
}

/** The watermark a poller echoes back: an ISO instant with `Z`, as minted by
 *  `checkedInAtIsoSql`. Anything else is treated as having no watermark. */
const watermarkSchema = z.iso.datetime();

/**
 * Reports check-ins recorded since `since` so a roster already on screen can
 * be patched instead of refetched. `since` is the newest `checkedInAt` the
 * caller holds; pass null to get every check-in.
 *
 * Deliberately narrower than `getCheckInRoster`: it touches only `check_ins`
 * (plus the scanner's name), so polling it every few seconds costs an index
 * scan rather than the roster's five-table join.
 *
 * Requires checkin:write:all permission.
 */
export async function getCheckInUpdates(
  eventId: string,
  since: string | null,
  targetEventId?: string | null,
): Promise<ActionResult<CheckInUpdates>> {
  const actor = await getScanner();
  if (!actor) return fail('Not authenticated');
  if (!UUID_PATTERN.test(eventId)) return fail('Event not found.');

  // Gated like the writes even though it only returns timestamps: an
  // unvalidated target would let a caller poll another event's check-in times.
  if (!(await isCheckInEnabled(eventId, targetEventId))) {
    return fail('Check-in is disabled for this event.');
  }

  const target = await resolveCheckInTarget(eventId, targetEventId);
  if (!target) return fail(UNKNOWN_TARGET);

  // A malformed watermark degrades to a full patch rather than an error: the
  // caller reconciles against checkedInCount either way, so the worst case is
  // one oversized poll instead of a roster stuck on stale data.
  const parsed = watermarkSchema.safeParse(since);
  const watermark = parsed.success ? parseInstant(parsed.data) : null;

  const scanner = alias(user, 'scanner');
  const [changed, [totals]] = await Promise.all([
    db
      .select({
        userId: checkIns.userId,
        checkedInAt: checkedInAtIsoSql,
        checkedInAtLabel: checkedInAtLabelSql,
        scannerName: scanner.name,
      })
      .from(checkIns)
      .leftJoin(scanner, eq(scanner.id, checkIns.checkedInBy))
      .where(
        watermark
          ? and(
              eq(checkIns.eventId, target.targetId),
              gt(checkIns.checkedInAt, watermark),
            )
          : eq(checkIns.eventId, target.targetId),
      ),
    db
      .select({ checkedInCount: sql<number>`count(*)::int` })
      .from(checkIns)
      .where(eq(checkIns.eventId, target.targetId)),
  ]);

  return ok({
    changed: changed.map((row) => ({
      userId: row.userId,
      checkedInAt: row.checkedInAt,
      checkedInAtLabel: row.checkedInAtLabel,
      checkedInByName: row.scannerName,
    })),
    checkedInCount: totals?.checkedInCount ?? 0,
  });
}
