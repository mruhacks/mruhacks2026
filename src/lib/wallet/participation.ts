import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import {
  eventParticipants,
  events,
  participationStatuses,
  userProfiles,
} from '@/db/schema';
import { isAttending, resolveStoredStatus } from '@/lib/participation/status';
import { db } from '@/utils/db';

export const EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EventParticipation = {
  eventName: string;
  startsAt: Date | null;
  endsAt: Date | null;
  checkInEnabled: boolean;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  fullName: string | null;
  /** Holds a spot (`accepted`) in this (top-level) event. */
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
      checkInEnabled: events.checkInEnabled,
      location: events.location,
      latitude: events.latitude,
      longitude: events.longitude,
      radiusMeters: events.radiusMeters,
      statusLabel: participationStatuses.label,
      fullName: userProfiles.fullName,
    })
    .from(events)
    .leftJoin(
      eventParticipants,
      and(
        eq(eventParticipants.eventId, events.id),
        eq(eventParticipants.userId, userId),
      ),
    )
    .leftJoin(
      participationStatuses,
      eq(participationStatuses.id, eventParticipants.statusId),
    )
    .leftJoin(userProfiles, eq(userProfiles.userId, userId))
    .where(and(eq(events.id, eventId), isNull(events.parentEventId)))
    .limit(1);

  if (!row) return null;

  return {
    eventName: row.eventName,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    checkInEnabled: row.checkInEnabled,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMeters: row.radiusMeters,
    fullName: row.fullName,
    // An invited applicant who never accepted their RSVP (or who declined
    // or let it expire) doesn't get a pass — only a held spot does.
    isParticipant:
      row.statusLabel !== null &&
      isAttending(resolveStoredStatus(row.statusLabel)),
  };
}

/** The wallet routes' shared name fallback: profile name, then account name, then a generic label — never undefined. */
export function resolveParticipantName(
  fullName: string | null,
  accountName: string,
): string {
  return fullName || accountName || 'Participant';
}
