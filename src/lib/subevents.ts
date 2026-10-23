import { cacheLife, cacheTag } from 'next/cache';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { db } from '@/utils/db';

export { isSubeventRunning } from '@/lib/subevent-running';

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
  eventTypeLabel: string | null;
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
export async function listSubevents(parentEventId: string): Promise<SubeventRow[]> {
  'use cache';
  cacheTag(subeventsCacheTag(parentEventId));
  // Settings and copy edits invalidate this parent-scoped cache too.
  cacheLife('minutes');

  return db
    .select({
      id: schema.events.id,
      name: schema.events.name,
      startsAt: schema.events.startsAt,
      endsAt: schema.events.endsAt,
      location: schema.events.location,
      descriptionMarkdown: schema.events.descriptionMarkdown,
      checkInEnabled: schema.events.checkInEnabled,
      eventTypeLabel: schema.eventTypes.label,
    })
    .from(schema.events)
    .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.events.eventTypeId))
    .where(eq(schema.events.parentEventId, parentEventId))
    .orderBy(asc(schema.events.startsAt), asc(schema.events.name));
}

/** A start time is enough to publish an entry in the participant schedule. */
export function isScheduleVisible(row: Pick<SubeventRow, 'startsAt'>): boolean {
  return row.startsAt !== null;
}

/**
 * Check-ins per sub-event, keyed by sub-event id. Sub-events with none are
 * absent from the map rather than zero, so callers should default.
 */
export async function getSubeventCheckInCounts(subeventIds: string[]): Promise<Record<string, number>> {
  if (subeventIds.length === 0) return {};

  const rows = await db
    .select({
      eventId: schema.checkIns.eventId,
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(schema.checkIns)
    .where(inArray(schema.checkIns.eventId, subeventIds))
    .groupBy(schema.checkIns.eventId);

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
  if (!targetEventId || targetEventId.toLowerCase() === mainEventId.toLowerCase()) {
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
      id: schema.events.id,
      name: schema.events.name,
      startsAt: schema.events.startsAt,
      endsAt: schema.events.endsAt,
    })
    .from(schema.events)
    .where(and(eq(schema.events.id, targetEventId), eq(schema.events.parentEventId, mainEventId)))
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
export async function getParentEventId(eventId: string): Promise<string | null> {
  const [row] = await db
    .select({ parentEventId: schema.events.parentEventId })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), isNotNull(schema.events.parentEventId)))
    .limit(1);

  return row?.parentEventId ?? null;
}

export async function resolveEventRoot(eventId: string): Promise<{ id: string; endsAt: Date | null } | null> {
  const [walk] = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE walk AS (
      SELECT id, parent_event_id
      FROM ${schema.events}
      WHERE id = ${eventId}
      UNION ALL
      SELECT e.id, e.parent_event_id
      FROM ${schema.events} e
      INNER JOIN walk w ON w.parent_event_id = e.id
    )
    SELECT id FROM walk WHERE parent_event_id IS NULL
  `);
  if (!walk) return null;

  const [row] = await db
    .select({ id: schema.events.id, endsAt: schema.events.endsAt })
    .from(schema.events)
    .where(eq(schema.events.id, walk.id))
    .limit(1);
  return row ?? null;
}

export async function listEventTreeIds(rootId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM ${schema.events} WHERE id = ${rootId}
      UNION ALL
      SELECT e.id
      FROM ${schema.events} e
      INNER JOIN tree t ON e.parent_event_id = t.id
    )
    SELECT id FROM tree
  `);
  return rows.map((row) => row.id);
}
