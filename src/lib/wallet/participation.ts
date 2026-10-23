import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import * as schema from '@/db/schema';
import * as Participation from '@/lib/participation';
import { db } from '@/utils/db';

const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
export async function getEventParticipation(eventId: string, userId: string): Promise<EventParticipation | null> {
  if (!EVENT_ID_PATTERN.test(eventId)) return null;

  const [row] = await db
    .select({
      eventName: schema.events.name,
      startsAt: schema.events.startsAt,
      endsAt: schema.events.endsAt,
      checkInEnabled: schema.events.checkInEnabled,
      location: schema.events.location,
      latitude: schema.events.latitude,
      longitude: schema.events.longitude,
      radiusMeters: schema.events.radiusMeters,
      statusLabel: schema.participationStatuses.label,
      fullName: schema.userProfiles.fullName,
    })
    .from(schema.events)
    .leftJoin(
      schema.eventParticipants,
      and(eq(schema.eventParticipants.eventId, schema.events.id), eq(schema.eventParticipants.userId, userId)),
    )
    .leftJoin(schema.participationStatuses, eq(schema.participationStatuses.id, schema.eventParticipants.statusId))
    .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, userId))
    .where(and(eq(schema.events.id, eventId), isNull(schema.events.parentEventId)))
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
      row.statusLabel !== null && Participation.isAttending(Participation.resolveStoredStatus(row.statusLabel)),
  };
}

/** The wallet routes' shared name fallback: profile name, then account name, then a generic label — never undefined. */
export function resolveParticipantName(fullName: string | null, accountName: string): string {
  return fullName || accountName || 'Participant';
}
