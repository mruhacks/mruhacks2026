import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import * as Participation from '@/lib/participation/server';
import { isUuid } from '@/lib/uuid';
import { db } from '@/utils/db';

/** A user's standing in a top-level event, with what their pass shows. */
export type Holder = {
  eventName: string;
  startsAt: Date | null;
  endsAt: Date | null;
  checkInEnabled: boolean;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  fullName: string | null;
  /** Holds a spot in this event (see `Participation.attending`). */
  isParticipant: boolean;
};

/**
 * Looks up a user's standing in a top-level event, whether or not it earns
 * a pass. Returns null for a malformed id, a sub-event, or a nonexistent
 * event: sub-events issue no passes of their own.
 */
export async function lookupHolder(eventId: string, userId: string): Promise<Holder | null> {
  if (!isUuid(eventId)) return null;

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
      fullName: schema.userProfiles.fullName,
      isParticipant: sql<boolean>`${schema.eventParticipants.userId} IS NOT NULL`,
    })
    .from(schema.events)
    // An invited applicant who never accepted their RSVP (or who declined or
    // let it expire) holds no spot, so the join finds nothing for them.
    .leftJoin(
      schema.eventParticipants,
      and(
        eq(schema.eventParticipants.eventId, schema.events.id),
        eq(schema.eventParticipants.userId, userId),
        Participation.attending(),
      ),
    )
    .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, userId))
    .where(and(eq(schema.events.id, eventId), isNull(schema.events.parentEventId)))
    .limit(1);

  return row ?? null;
}

/**
 * Whether this user gets a pass for this event: it's a top-level event, they
 * hold a spot, and check-in is on. The one guard behind the Apple and Google
 * wallet passes, the QR code and the ticket page, so they can never disagree.
 *
 * Returns null when they don't. Callers answer that with the same 404 for
 * every reason, so the endpoints can't be used to probe who has applied.
 */
export async function passEligibility(eventId: string, userId: string): Promise<Holder | null> {
  const holder = await lookupHolder(eventId, userId);
  return holder && isEligible(holder) ? holder : null;
}

/** `passEligibility`'s rule, for a caller that already has the holder. */
export function isEligible(holder: Holder): boolean {
  return holder.isParticipant && holder.checkInEnabled;
}
