import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import {
  eventParticipants,
  events,
  participationStatuses,
  user,
} from '@/db/schema';
import { countAttending } from '@/lib/participation/server';
import { WAVE_ELIGIBLE_STATUSES } from '@/lib/participation/status';
import { db } from '@/utils/db';

export type EligibleRsvpApplicant = {
  userId: string;
  email: string;
  /** `event_participants.id` — the row the invitation is created against. */
  participantId: string;
  /** Queue order on the waitlist; null when unranked (invited last). */
  waitlistPosition: number | null;
  /** `event_participants.created_at` — original application submission. */
  applicationCreatedAt: Date;
};

export type RsvpEligibilityResult = {
  applicants: EligibleRsvpApplicant[];
  /** Event capacity, or null when unlimited. */
  capacity: number | null;
  /** Participants currently holding a spot (`accepted`). */
  attendeeCount: number;
  /** Remaining spots (`capacity - attendeeCount`), or null when unlimited. */
  availableSpots: number | null;
};

/**
 * Participants eligible for the next RSVP wave: everyone `waitlisted`.
 * Being invited moves a participant off the waitlist, so nobody is
 * offered a second invitation — an expired or declined one was their chance.
 * Callers must not assume the returned set is the wave: use
 * `selectRsvpWaveInvitees` to order and cap by remaining capacity.
 */
export async function getEligibleRsvpApplicants(
  eventId: string,
): Promise<RsvpEligibilityResult | null> {
  const [eventRow] = await db
    .select({ id: events.id, capacity: events.capacity })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!eventRow) return null;

  const attendeeCount = await countAttending(eventId);
  const capacity = eventRow.capacity ?? null;
  const availableSpots =
    capacity === null ? null : Math.max(0, capacity - attendeeCount);

  const rows = await db
    .select({
      userId: eventParticipants.userId,
      email: user.email,
      participantId: eventParticipants.id,
      waitlistPosition: eventParticipants.waitlistPosition,
      applicationCreatedAt: eventParticipants.createdAt,
    })
    .from(eventParticipants)
    .innerJoin(
      participationStatuses,
      eq(eventParticipants.statusId, participationStatuses.id),
    )
    .innerJoin(user, eq(eventParticipants.userId, user.id))
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        inArray(participationStatuses.label, [...WAVE_ELIGIBLE_STATUSES]),
      ),
    );

  return {
    applicants: rows,
    capacity,
    attendeeCount,
    availableSpots,
  };
}
