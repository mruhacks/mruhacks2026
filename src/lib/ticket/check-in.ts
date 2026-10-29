import 'server-only';

import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import * as schema from '@/db/schema';
import { invalidateEvent } from '@/lib/event-cache';
import { parseInstant } from '@/lib/datetime';
import { isSubeventRunning } from '@/lib/subevents';
import { isUuid } from '@/lib/uuid';
import * as Rbac from '@/lib/rbac/server';
import * as Wallet from '@/lib/wallet/server';
import * as Participation from '@/lib/participation/server';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { writeAuditLog } from '@/utils/audit-log';
import { dietaryRestrictionsList, MEAL_EVENT_TYPE } from '@/types/lookups';
import { db } from '@/utils/db';
import { hasEnded, lookupHolder } from './eligibility';

/**
 * The check-in desk's rules: who can be checked in where and when, and what
 * the desk sees. The scanner actions only authenticate the volunteer and
 * hand over to these, so the rules can be exercised with any actor and any
 * `now`, without a scanner session.
 */

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
  /**
   * What the participant can't eat, shown on a meal check-in so the volunteer
   * can hand them the right plate. Null when the target isn't a meal or the
   * scanner lacks `dietary:read:all`; an empty `restrictions` means none.
   */
  dietary: CheckInDietary | null;
};

export type CheckInDietary = {
  restrictions: string[];
  /** Free text from the "Other" option, if they picked it. */
  otherText: string | null;
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

type CheckInTarget = {
  /** The event id a check-in row should actually be written against. */
  targetId: string;
  isSubevent: boolean;
  /** The sub-event's name, or null when the target is the main event. */
  name: string | null;
  /** The sub-event's schedule slot; null for the main event. */
  startsAt: Date | null;
  endsAt: Date | null;
  /** Whether the target is a meal, so the desk can surface dietary needs. */
  isMeal: boolean;
  checkInEnabled: boolean;
};

/** A main event's check-in desk, armed on one target. */
type Desk = {
  /** The main event: the one passes are issued for and participation is judged against. */
  eventId: string;
  /** The main event's end, which freezes every target. */
  endsAt: Date | null;
  target: CheckInTarget;
};

const MAIN_EVENTS_ONLY = 'Check-in is only available for main events.';
const DISABLED = 'Check-in is disabled for this event.';
/** The failure every action shares when a target isn't this event's sub-event. */
const UNKNOWN_TARGET = 'That schedule entry does not belong to this event.';
const TARGET_NOT_RUNNING = "That schedule entry isn't running right now, so it can't take check-ins.";
const FROZEN = 'This event has ended. Check-in is frozen.';

/** Wall clock in America/Edmonton, computed by Postgres — never by JS Date. */
const checkedInAtIsoSql = sql<string>`to_char(${schema.checkIns.checkedInAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const checkedInAtLabelSql = sql<string>`trim(to_char(${schema.checkIns.checkedInAt} AT TIME ZONE 'America/Edmonton', 'Mon FMDD, YYYY, FMHH12:MI AM')) || ' MT'`;

/**
 * Resolves a scanner's check-in target to a concrete event.
 *
 * An attendee's pass only ever carries the *main* event's id — sub-events issue
 * no passes of their own — so the sub-event being scanned for arrives as a
 * separate argument, chosen in the check-in UI. That makes this the one place
 * that has to prove the target is legitimate, and it does so by pinning
 * `parent_event_id` to the main event in the lookup itself: an arbitrary event
 * id simply doesn't come back, so it can never reach a write.
 */
async function resolveTarget(mainEventId: string, targetEventId: string | null | undefined) {
  if (!targetEventId || targetEventId.toLowerCase() === mainEventId.toLowerCase()) {
    return {
      targetId: mainEventId,
      isSubevent: false,
      name: null,
      startsAt: null,
      endsAt: null,
      isMeal: false,
      // The main event's own flag, already checked by `openDesk`.
      checkInEnabled: true,
    } satisfies CheckInTarget;
  }
  if (!isUuid(targetEventId)) return null;

  const [row] = await db
    .select({
      id: schema.events.id,
      name: schema.events.name,
      startsAt: schema.events.startsAt,
      endsAt: schema.events.endsAt,
      checkInEnabled: schema.events.checkInEnabled,
      eventTypeLabel: schema.eventTypes.label,
    })
    .from(schema.events)
    .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.events.eventTypeId))
    .where(and(eq(schema.events.id, targetEventId), eq(schema.events.parentEventId, mainEventId)))
    .limit(1);

  if (!row) return null;

  return {
    targetId: row.id,
    isSubevent: true,
    name: row.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    isMeal: row.eventTypeLabel === MEAL_EVENT_TYPE,
    checkInEnabled: row.checkInEnabled,
  } satisfies CheckInTarget;
}

/**
 * The checks every desk operation starts with, reads included: `eventId` is
 * a top-level event with check-in on, and `targetEventId` (if any) is one of
 * its sub-events with check-in on. Reads are gated like writes because an
 * unvalidated target would let a caller see another event's check-ins.
 */
async function openDesk(eventId: string, targetEventId: string | null | undefined): Promise<ActionResult<Desk>> {
  // Every id here goes into a uuid column, where a malformed one raises
  // instead of matching nothing.
  if (!isUuid(eventId)) return fail('Event not found.');

  const [main] = await db
    .select({ id: schema.events.id, endsAt: schema.events.endsAt, checkInEnabled: schema.events.checkInEnabled })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), isNull(schema.events.parentEventId)))
    .limit(1);
  if (!main) return fail(MAIN_EVENTS_ONLY);
  if (!main.checkInEnabled) return fail(DISABLED);

  const target = await resolveTarget(main.id, targetEventId);
  if (!target) return fail(UNKNOWN_TARGET);
  if (!target.checkInEnabled) return fail(DISABLED);

  return ok({ eventId: main.id, endsAt: main.endsAt, target });
}

/**
 * `openDesk`, plus the rules for changing what's recorded. The door is open
 * until the event ends; a schedule entry only while it's running, unless the
 * actor holds `checkin:override:all` — which is what lets an organizer fix a
 * missed scan after lunch has ended. Enforced here, not just by hiding the
 * entry in the picker: a stale tab or hand-edited `?target=` would otherwise
 * walk straight past it.
 *
 * The freeze reads the *main* event's end, so a sub-event stays open for
 * corrections after its own slot has passed and closes only once the whole
 * event is over. A meal line at 13:05 for a 13:00 lunch is the normal case,
 * not an error, and undo has to stay available for exactly as long as
 * check-in does.
 */
async function openDeskForWrites(
  eventId: string,
  targetEventId: string | null | undefined,
  actorId: string,
  now: Date,
): Promise<ActionResult<Desk>> {
  const desk = await openDesk(eventId, targetEventId);
  if (!desk.success) return desk;
  const { target } = desk.data!;

  if (
    target.isSubevent &&
    !isSubeventRunning(target, now.getTime()) &&
    !(await Rbac.hasPermission(actorId, 'checkin:override:all'))
  ) {
    return fail(TARGET_NOT_RUNNING);
  }
  if (hasEnded(desk.data!, now)) return fail(FROZEN);

  return desk;
}

async function loadDietary(userId: string): Promise<CheckInDietary> {
  const [labelRows, [profile]] = await Promise.all([
    db
      .select({ label: schema.dietaryRestrictions.label })
      .from(schema.userDietaryRestrictions)
      .innerJoin(
        schema.dietaryRestrictions,
        eq(schema.dietaryRestrictions.id, schema.userDietaryRestrictions.restrictionId),
      )
      .where(eq(schema.userDietaryRestrictions.userId, userId)),
    db
      .select({ otherText: schema.userProfiles.dietaryOtherText })
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1),
  ]);

  // Same ordering and "Other" handling as the dietary report, so the desk and
  // the kitchen's numbers describe a person the same way.
  const labels = new Set<string>(labelRows.map((row) => row.label));
  return {
    restrictions: dietaryRestrictionsList.filter((label) => labels.has(label)),
    otherText: labels.has('Other') ? profile?.otherText?.trim() || null : null,
  };
}

async function loadAccountName(userId: string): Promise<string> {
  const [row] = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
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
): Promise<Omit<CheckInOutcome, 'userId' | 'name' | 'targetName' | 'dietary'> | null> {
  const [inserted] = await db
    .insert(schema.checkIns)
    .values({ eventId, userId, checkedInBy: actorId })
    .onConflictDoNothing({ target: [schema.checkIns.userId, schema.checkIns.eventId] })
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
  if (inserted) await invalidateEvent(mainEventId, 'participation');

  if (inserted) {
    return {
      alreadyCheckedIn: false,
      checkedInAt: inserted.checkedInAt,
      checkedInAtLabel: inserted.checkedInAtLabel,
      checkedInByName: null,
    };
  }

  const scanner = alias(schema.user, 'scanner');
  const [existing] = await db
    .select({
      checkedInAt: checkedInAtIsoSql,
      checkedInAtLabel: checkedInAtLabelSql,
      scannerName: scanner.name,
    })
    .from(schema.checkIns)
    .leftJoin(scanner, eq(scanner.id, schema.checkIns.checkedInBy))
    .where(and(eq(schema.checkIns.eventId, eventId), eq(schema.checkIns.userId, userId)))
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
 * Who a check-in is for: the payload read off their pass, or a participant
 * the volunteer picked by hand. Passes are only ever issued for a main event,
 * so a scanned pass is compared against `eventId` even when the target is
 * one of its sub-events.
 */
function identify(eventId: string, who: { payload: string } | { userId: string }): ActionResult<string> {
  if ('userId' in who) {
    return isUuid(who.userId) ? ok(who.userId) : fail('Unknown participant.');
  }

  const claims = Wallet.verifyCheckInPayload(who.payload);
  if (!claims) return fail('This is not a valid MRUHacks pass.');
  // The token's id comes back lowercase from bytesToUuid, while the route
  // param keeps whatever case the URL used, so a mixed-case event URL would
  // otherwise reject every valid pass.
  if (claims.eventId.toLowerCase() !== eventId.toLowerCase()) {
    return fail('This pass was issued for a different event.');
  }
  return ok(claims.userId);
}

/**
 * Records one check-in. `eventId` is always the *main* event — the one the
 * pass was issued for and the one participation is judged against — while
 * `targetEventId` optionally narrows it to one of its sub-events.
 */
export async function checkIn(input: {
  eventId: string;
  targetEventId?: string | null;
  who: { payload: string } | { userId: string };
  actorId: string;
  now?: Date;
}): Promise<ActionResult<CheckInOutcome>> {
  const { actorId, now = new Date() } = input;

  const identified = identify(input.eventId, input.who);
  if (!identified.success) return identified;
  const userId = identified.data!;

  const opened = await openDeskForWrites(input.eventId, input.targetEventId, actorId, now);
  if (!opened.success) return opened;
  const { eventId, target } = opened.data!;

  const holder = await lookupHolder(eventId, userId);
  if (!holder?.isParticipant) {
    return fail('This person is not registered for this event.');
  }

  const name = Wallet.resolveParticipantName(holder.fullName, await loadAccountName(userId));

  // A sub-event is for people who are actually here, so the door comes first.
  // Read-then-write rather than an atomic insert-where-exists: the atomic form
  // can't tell "not at the door" apart from "already checked in" through
  // onConflictDoNothing, and the race it would close is benign — a door
  // check-in undone microseconds earlier, which the roster shows anyway.
  if (target.isSubevent) {
    const [atDoor] = await db
      .select({ userId: schema.checkIns.userId })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.eventId, eventId), eq(schema.checkIns.userId, userId)))
      .limit(1);
    if (!atDoor) {
      return fail(`${name} has not checked in at the main event yet — check them in at the door first.`);
    }
  }

  const recorded = await recordCheckIn(target.targetId, eventId, userId, actorId);
  if (!recorded) {
    return fail('That check-in was just undone. Scan again to redo it.');
  }

  if (!recorded.alreadyCheckedIn) {
    await writeAuditLog({
      actorId,
      action: 'checkin.create',
      targetType: 'user',
      targetId: userId,
      metadata: target.isSubevent ? { eventId, subeventId: target.targetId } : { eventId },
    });
  }

  const dietary =
    target.isMeal && (await Rbac.hasPermission(actorId, 'dietary:read:all')) ? await loadDietary(userId) : null;

  return ok({ userId, name, targetName: target.name, dietary, ...recorded });
}

/** Removes a check-in recorded in error, leaving only the audit log entry. */
export async function undoCheckIn(input: {
  eventId: string;
  targetEventId?: string | null;
  userId: string;
  actorId: string;
  now?: Date;
}): Promise<ActionResult> {
  const { userId, actorId, now = new Date() } = input;
  if (!isUuid(userId)) return fail('Unknown participant.');

  const opened = await openDeskForWrites(input.eventId, input.targetEventId, actorId, now);
  if (!opened.success) return opened;
  const { eventId, target } = opened.data!;

  const [removed] = await db
    .delete(schema.checkIns)
    .where(and(eq(schema.checkIns.eventId, target.targetId), eq(schema.checkIns.userId, userId)))
    .returning({ checkedInAt: schema.checkIns.checkedInAt });

  if (!removed) return fail('They were not checked in.');

  await invalidateEvent(eventId, 'participation');

  await writeAuditLog({
    actorId,
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

/** Lists everyone eligible to attend the event, checked in at the target or not. */
export async function roster(
  eventId: string,
  targetEventId?: string | null,
): Promise<ActionResult<CheckInRosterRow[]>> {
  const opened = await openDesk(eventId, targetEventId);
  if (!opened.success) return opened;
  const { eventId: mainEventId, target } = opened.data!;

  const scanner = alias(schema.user, 'scanner');
  // Door check-ins, read separately from the target's own. A sub-event roster
  // lists the *main* event's population — a child has no applicants or
  // attendees of its own — so who is actually here has to come from the main
  // event's rows even while `checkedInAt` tracks the sub-event's.
  const doorCheckIns = alias(schema.checkIns, 'door_check_ins');

  const rows = await db
    .select({
      userId: schema.user.id,
      email: schema.user.email,
      accountName: schema.user.name,
      fullName: schema.userProfiles.fullName,
      checkedInAt: checkedInAtIsoSql,
      checkedInAtLabel: checkedInAtLabelSql,
      scannerName: scanner.name,
      atMainEvent: sql<boolean>`${doorCheckIns.userId} IS NOT NULL`,
    })
    .from(schema.user)
    // Everyone holding a spot — and nobody else.
    .innerJoin(
      schema.eventParticipants,
      and(
        eq(schema.eventParticipants.eventId, mainEventId),
        eq(schema.eventParticipants.userId, schema.user.id),
        Participation.attending(),
      ),
    )
    .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.user.id))
    .leftJoin(
      schema.checkIns,
      and(eq(schema.checkIns.eventId, target.targetId), eq(schema.checkIns.userId, schema.user.id)),
    )
    // Joined unconditionally rather than only for a sub-event: on a main target
    // it resolves to the very same row as the join above (the unique index
    // guarantees at most one), so it cannot fan out, and one code path beats a
    // dynamic query whose result type changes with the target.
    .leftJoin(doorCheckIns, and(eq(doorCheckIns.eventId, mainEventId), eq(doorCheckIns.userId, schema.user.id)))
    .leftJoin(scanner, eq(scanner.id, schema.checkIns.checkedInBy));

  return ok(
    rows.map((row) => ({
      userId: row.userId,
      name: Wallet.resolveParticipantName(row.fullName, row.accountName),
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
 * Deliberately narrower than `roster`: it touches only `check_ins` (plus the
 * scanner's name), so polling it every few seconds costs an index scan rather
 * than the roster's five-table join.
 */
export async function updates(
  eventId: string,
  since: string | null,
  targetEventId?: string | null,
): Promise<ActionResult<CheckInUpdates>> {
  const opened = await openDesk(eventId, targetEventId);
  if (!opened.success) return opened;
  const { target } = opened.data!;

  // A malformed watermark degrades to a full patch rather than an error: the
  // caller reconciles against checkedInCount either way, so the worst case is
  // one oversized poll instead of a roster stuck on stale data.
  const parsed = watermarkSchema.safeParse(since);
  const watermark = parsed.success ? parseInstant(parsed.data) : null;

  const scanner = alias(schema.user, 'scanner');
  const [changed, [totals]] = await Promise.all([
    db
      .select({
        userId: schema.checkIns.userId,
        checkedInAt: checkedInAtIsoSql,
        checkedInAtLabel: checkedInAtLabelSql,
        scannerName: scanner.name,
      })
      .from(schema.checkIns)
      .leftJoin(scanner, eq(scanner.id, schema.checkIns.checkedInBy))
      .where(
        watermark
          ? and(eq(schema.checkIns.eventId, target.targetId), gt(schema.checkIns.checkedInAt, watermark))
          : eq(schema.checkIns.eventId, target.targetId),
      ),
    db
      .select({ checkedInCount: sql<number>`count(*)::int` })
      .from(schema.checkIns)
      .where(eq(schema.checkIns.eventId, target.targetId)),
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
