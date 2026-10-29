import { cacheTag, cacheLife } from 'next/cache';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import { isEventUuid } from '@/lib/event-slug';
import * as Participation from '@/lib/participation/server';

/** Invalidated by updateTag() whenever an event is created or its settings change. */
export const EVENTS_CACHE_TAG = 'events';

/**
 * Core event listing fields (id, name, dates, application flag), same for
 * every viewer regardless of session. Shared by the dashboard events list
 * and the admin events list so both read from one cache entry.
 *
 * Top-level events only. Sub-events (meals, workshops — child rows carrying a
 * `parent_event_id`) are not events in their own right anywhere a list is
 * shown: they have no registration, no pass and no page of their own, and
 * belong to their parent's schedule. Filtered here rather than at each call
 * site so a new consumer can't forget; anything that actually wants children
 * goes through `listSubevents` in `@/lib/subevents`.
 */
export async function getAllEvents() {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  // updateTag() covers create/settings-update, but 'minutes' (still App
  // Shell-prefetchable) is a cheap safety net against a missed path.
  cacheLife('minutes');

  return db
    .select({
      id: schema.events.id,
      slug: schema.events.slug,
      name: schema.events.name,
      hasApplication: schema.events.hasApplication,
      startsAt: schema.events.startsAt,
      endsAt: schema.events.endsAt,
    })
    .from(schema.events)
    .where(isNull(schema.events.parentEventId))
    .orderBy(desc(schema.events.createdAt));
}

/**
 * Resolves a `[eventId]` route segment to the event's uuid. The segment is
 * either the uuid itself or the event's custom slug (see `@/lib/event-slug`),
 * so every page that queries by id has to translate first. Returns null when
 * the segment is a slug no event owns; a uuid is handed back unchanged and
 * left for the caller's own query to 404 on.
 */
export async function resolveEventId(segment: string): Promise<string | null> {
  if (isEventUuid(segment)) return segment;
  return getEventIdBySlug(segment);
}

/**
 * Slug -> uuid, cached per slug. Same output for every viewer, and read on
 * every request to a slug URL, so it shares the events tag rather than
 * hitting the DB per visit.
 */
async function getEventIdBySlug(slug: string): Promise<string | null> {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  // Busted by updateTag() on create/settings-update, the two paths that can
  // move a slug; 'minutes' is the same safety net the listing above uses.
  cacheLife('minutes');

  const [row] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.slug, slug))
    .limit(1);

  return row?.id ?? null;
}

/**
 * True once an event's end instant is in the past. Null `endsAt` (no end
 * date configured) never elapses — used to freeze participant- and
 * admin-facing mutations (unregister, check-in, team changes) once an event
 * is over.
 */
export function hasEventElapsed(endsAt: Date | null): boolean {
  return endsAt != null && endsAt.getTime() < Date.now();
}

export type EventParticipationCount = {
  /** Every participant row — applications, or signups for an event without one. */
  applications: number;
  /** Participants holding a spot (`accepted`). */
  attendees: number;
};

/**
 * Per-event participant and attendee totals, keyed by event id. Sitewide
 * numbers rather than per-viewer ones, so one cache entry serves every admin
 * looking at the event list.
 */
export async function getEventParticipationCounts(): Promise<Record<string, EventParticipationCount>> {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  // These move whenever a participant applies or registers, which no admin
  // mutation tag covers — 'minutes' (still App Shell-prefetchable) is what
  // bounds how stale a total can get.
  cacheLife('minutes');

  const rows = await db
    .select({
      eventId: schema.eventParticipants.eventId,
      applications: sql<number>`COUNT(*)`.mapWith(Number),
      attendees:
        sql<number>`COUNT(*) FILTER (WHERE ${schema.eventParticipants.statusId} = ${Participation.statusIdOf('accepted')})`.mapWith(
          Number,
        ),
    })
    .from(schema.eventParticipants)
    .groupBy(schema.eventParticipants.eventId);

  return Object.fromEntries(
    rows.map((row) => [row.eventId, { applications: row.applications, attendees: row.attendees }]),
  );
}
