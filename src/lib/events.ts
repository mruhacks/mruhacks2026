import { cacheTag, cacheLife } from 'next/cache';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/utils/db';
import { events, eventApplications, eventAttendees } from '@/db/schema';
import { isEventUuid } from '@/lib/event-slug';

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
      id: events.id,
      slug: events.slug,
      name: events.name,
      hasApplication: events.hasApplication,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
    })
    .from(events)
    .where(isNull(events.parentEventId))
    .orderBy(desc(events.createdAt));
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
    .select({ id: events.id })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);

  return row?.id ?? null;
}

/**
 * Every `[eventId]` segment an event is reachable at: its uuid, plus its
 * custom slug when it has one. Mutations loop over this to revalidate each
 * live URL — a page cached under the slug form is a different router-cache
 * entry from the same page under the uuid.
 */
export async function eventUrlSegments(eventId: string): Promise<string[]> {
  const [row] = await db
    .select({ slug: events.slug })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  return row?.slug ? [eventId, row.slug] : [eventId];
}

/** One tag per user, invalidated wherever they apply, register, or unregister. */
export function userEventsCacheTag(userId: string): string {
  return `user-events:${userId}`;
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

export type UserEventParticipation = {
  /** eventId -> applicationId, for events this user has applied to. */
  applicationIdByEventId: Record<string, string>;
  /** eventIds this user is a registered attendee of (no-application events). */
  registeredEventIds: string[];
};

/**
 * Which events a user has applied to or registered for. This only changes
 * when the user submits/updates an application or (un)registers, so it's
 * cached per user. The application's live review status is deliberately
 * left out — that's read fresh separately since it can change out from
 * under the applicant (an admin review) without the user taking any action.
 */
export async function getUserEventParticipation(
  userId: string,
): Promise<UserEventParticipation> {
  'use cache';
  cacheTag(userEventsCacheTag(userId));
  // updateTag() covers apply/register/unregister, but 'minutes' (still App
  // Shell-prefetchable) is a cheap safety net against a missed path.
  cacheLife('minutes');

  const [applicationRows, attendeeRows] = await Promise.all([
    db
      .select({ eventId: eventApplications.eventId, id: eventApplications.id })
      .from(eventApplications)
      .where(eq(eventApplications.userId, userId)),
    db
      .select({ eventId: eventAttendees.eventId })
      .from(eventAttendees)
      .where(eq(eventAttendees.userId, userId)),
  ]);

  return {
    applicationIdByEventId: Object.fromEntries(
      applicationRows.map((r) => [r.eventId, r.id]),
    ),
    registeredEventIds: attendeeRows.map((r) => r.eventId),
  };
}

export type EventParticipationCount = {
  applications: number;
  attendees: number;
};

/**
 * Per-event application and attendee totals, keyed by event id. Sitewide
 * numbers rather than per-viewer ones, so one cache entry serves every admin
 * looking at the event list.
 */
export async function getEventParticipationCounts(): Promise<
  Record<string, EventParticipationCount>
> {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  // These move whenever a participant applies or registers, which no admin
  // mutation tag covers — 'minutes' (still App Shell-prefetchable) is what
  // bounds how stale a total can get.
  cacheLife('minutes');

  const [applicationRows, attendeeRows] = await Promise.all([
    db
      .select({
        eventId: eventApplications.eventId,
        c: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(eventApplications)
      .groupBy(eventApplications.eventId),
    db
      .select({
        eventId: eventAttendees.eventId,
        c: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(eventAttendees)
      .groupBy(eventAttendees.eventId),
  ]);

  const counts: Record<string, EventParticipationCount> = {};
  for (const row of applicationRows) {
    counts[row.eventId] = { applications: row.c, attendees: 0 };
  }
  for (const row of attendeeRows) {
    const existing = counts[row.eventId];
    if (existing) existing.attendees = row.c;
    else counts[row.eventId] = { applications: 0, attendees: row.c };
  }

  return counts;
}
