import { cacheTag, cacheLife } from 'next/cache';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import { events, eventApplications, eventAttendees } from '@/db/schema';

/** Invalidated by updateTag() whenever an event is created or its settings change. */
export const EVENTS_CACHE_TAG = 'events';

/**
 * Core event listing fields (id, name, dates, application flag), same for
 * every viewer regardless of session. Shared by the dashboard events list
 * and the admin events list so both read from one cache entry.
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
      name: events.name,
      parentEventId: events.parentEventId,
      hasApplication: events.hasApplication,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
    })
    .from(events)
    .orderBy(desc(events.createdAt));
}

/** One tag per user, invalidated wherever they apply, register, or unregister. */
export function userEventsCacheTag(userId: string): string {
  return `user-events:${userId}`;
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
