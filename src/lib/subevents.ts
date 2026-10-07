import { cacheLife, cacheTag } from 'next/cache';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { checkIns, events } from '@/db/schema';
import { db } from '@/utils/db';

/**
 * A sub-event: a child `events` row standing in for something that happens
 * inside the main event — a meal, a workshop, a ceremony. It carries a name, a
 * time, place, optional Markdown copy and check-in setting. A sub-event
 * issues no passes, takes no applications and forms no teams.
 *
 * Sub-events deliberately reuse the events table rather than getting one of
 * their own: `check_ins`'s unique `(user_id, event_id)` index then gives
 * per-sub-event check-ins, with correct duplicate detection, for free. See
 * `docs/DATABASE.md`, which has described this as the intent since before any
 * of it was built.
 */
export type SubeventRow = {
  id: string;
  name: string;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
  descriptionMarkdown: string | null;
  checkInEnabled: boolean;
};

/** Invalidated whenever a schedule entry is created, edited or removed. */
export function subeventsCacheTag(parentEventId: string): string {
  return `subevents:${parentEventId}`;
}

/**
 * A main event's sub-events, in the order they happen.
 *
 * Returns *every* child, incomplete ones included, so the admin list and the
 * participant schedule share one cache entry. It's the participant surface that
 * applies `isScheduleVisible`, not this getter.
 */
export async function listSubevents(
  parentEventId: string,
): Promise<SubeventRow[]> {
  'use cache';
  cacheTag(subeventsCacheTag(parentEventId));
  // Settings and copy edits invalidate this parent-scoped cache too.
  cacheLife('minutes');

  return db
    .select({
      id: events.id,
      name: events.name,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      location: events.location,
      descriptionMarkdown: events.descriptionMarkdown,
      checkInEnabled: events.checkInEnabled,
    })
    .from(events)
    .where(eq(events.parentEventId, parentEventId))
    .orderBy(asc(events.startsAt), asc(events.name));
}

/** A start time is enough to publish an entry in the participant schedule. */
export function isScheduleVisible(row: Pick<SubeventRow, 'startsAt'>): boolean {
  return row.startsAt !== null;
}

/**
 * Whether a schedule entry is happening at `now` (epoch ms, default the present): started, and not
 * yet over. An entry with no start time is never running; one with no end
 * runs from its start onward.
 *
 * This is what a scanner without `checkin:override:all` is limited to — the
 * check-in desk only offers them what's on right now, so a volunteer can't arm
 * tomorrow's breakfast by mistake.
 */
export function isSubeventRunning(
  row: { startsAt: Date | null; endsAt: Date | null },
  now: number = Date.now(),
): boolean {
  if (!row.startsAt || row.startsAt.getTime() > now) return false;
  return !row.endsAt || row.endsAt.getTime() > now;
}

/**
 * Check-ins per sub-event, keyed by sub-event id. Sub-events with none are
 * absent from the map rather than zero, so callers should default.
 */
export async function getSubeventCheckInCounts(
  subeventIds: string[],
): Promise<Record<string, number>> {
  if (subeventIds.length === 0) return {};

  const rows = await db
    .select({
      eventId: checkIns.eventId,
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(checkIns)
    .where(inArray(checkIns.eventId, subeventIds))
    .groupBy(checkIns.eventId);

  return Object.fromEntries(rows.map((row) => [row.eventId, row.count]));
}

export type CheckInTarget = {
  /** The event id a check-in row should actually be written against. */
  targetId: string;
  isSubevent: boolean;
  /** The sub-event's name, or null when the target is the main event. */
  name: string | null;
  /** The sub-event's schedule slot; null for the main event. */
  startsAt: Date | null;
  endsAt: Date | null;
};

/**
 * Resolves a scanner's check-in target to a concrete event id.
 *
 * An attendee's pass only ever carries the *main* event's id — sub-events issue
 * no passes of their own — so the sub-event being scanned for arrives as a
 * separate argument, chosen in the check-in UI. That makes this the one place
 * that has to prove the target is legitimate, and it does so by pinning
 * `parent_event_id` to the main event in the lookup itself: an arbitrary event
 * id simply doesn't come back, so it can never reach a write.
 *
 * The no-target case deliberately validates nothing and does no query. Each
 * caller already has its own guard rejecting a sub-event id in the *main*
 * position — `getEventParticipation` for the writes, the `isNull` lookup in
 * `getCheckInRoster` — and those produce the more useful "only available for
 * main events" message. Duplicating the check here would only shadow it.
 */
export async function resolveCheckInTarget(
  mainEventId: string,
  targetEventId: string | null | undefined,
): Promise<CheckInTarget | null> {
  if (
    !targetEventId ||
    targetEventId.toLowerCase() === mainEventId.toLowerCase()
  ) {
    return {
      targetId: mainEventId,
      isSubevent: false,
      name: null,
      startsAt: null,
      endsAt: null,
    };
  }

  const [row] = await db
    .select({
      id: events.id,
      name: events.name,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
    })
    .from(events)
    .where(
      and(eq(events.id, targetEventId), eq(events.parentEventId, mainEventId)),
    )
    .limit(1);

  if (!row) return null;

  return {
    targetId: row.id,
    isSubevent: true,
    name: row.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

/**
 * The parent of a sub-event, or null when the id is a main event (or unknown).
 *
 * Used to redirect the surfaces that only make sense on a main event — a
 * sub-event's own check-in page, its participant event page — up to the event
 * they belong to, rather than 404ing or rendering something incoherent.
 */
export async function getParentEventId(
  eventId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ parentEventId: events.parentEventId })
    .from(events)
    .where(and(eq(events.id, eventId), isNotNull(events.parentEventId)))
    .limit(1);

  return row?.parentEventId ?? null;
}
