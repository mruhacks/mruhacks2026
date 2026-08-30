import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import {
  applicationStatuses,
  eventApplications,
  eventAttendees,
  events,
  userProfiles,
} from '@/db/schema';
import { db } from '@/utils/db';

export const EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EventParticipation = {
  eventName: string;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  fullName: string | null;
  /** Approved applicant or registered attendee of this (top-level) event. */
  isParticipant: boolean;
};

/**
 * Looks up a user's participation in a top-level event — shared by every
 * wallet endpoint (pkpass download, QR code) so they can never drift on who
 * counts as a participant.
 *
 * Returns null for a malformed id, a sub-event, or a nonexistent event.
 */
export async function getEventParticipation(
  eventId: string,
  userId: string,
): Promise<EventParticipation | null> {
  if (!EVENT_ID_PATTERN.test(eventId)) return null;

  const [row] = await db
    .select({
      eventName: events.name,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      location: events.location,
      latitude: events.latitude,
      longitude: events.longitude,
      radiusMeters: events.radiusMeters,
      statusLabel: applicationStatuses.label,
      attendeeUserId: eventAttendees.userId,
      fullName: userProfiles.fullName,
    })
    .from(events)
    .leftJoin(
      eventApplications,
      and(
        eq(eventApplications.eventId, events.id),
        eq(eventApplications.userId, userId),
      ),
    )
    .leftJoin(
      applicationStatuses,
      eq(applicationStatuses.id, eventApplications.statusId),
    )
    .leftJoin(
      eventAttendees,
      and(
        eq(eventAttendees.eventId, events.id),
        eq(eventAttendees.userId, userId),
      ),
    )
    .leftJoin(userProfiles, eq(userProfiles.userId, userId))
    .where(and(eq(events.id, eventId), isNull(events.parentEventId)))
    .limit(1);

  if (!row) return null;

  return {
    eventName: row.eventName,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMeters: row.radiusMeters,
    fullName: row.fullName,
    isParticipant:
      row.statusLabel === 'approved' || row.attendeeUserId !== null,
  };
}
