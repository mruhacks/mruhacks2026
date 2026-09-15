import 'server-only';

import { and, count, eq, notExists } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  applicationStatuses,
  eventApplications,
  eventAttendees,
  eventRsvpResponses,
  eventRsvpWaves,
  events,
  user,
} from '@/db/schema';
import { db } from '@/utils/db';

/** DB label in application_statuses for an approved application. */
const APPROVED_APPLICATION_STATUS_LABEL = 'approved';

export type EligibleRsvpApplicant = {
  userId: string;
  email: string;
  /** `event_applications.id` — unique; used only as a sort tie-break. */
  applicationId: string;
  /** `event_applications.created_at` — original application submission. */
  applicationCreatedAt: Date;
};

export type RsvpEligibilityResult = {
  applicants: EligibleRsvpApplicant[];
  /** Event capacity, or null when unlimited. */
  capacity: number | null;
  /** Current `event_attendees` count for the event. */
  attendeeCount: number;
  /** Remaining spots (`capacity - attendeeCount`), or null when unlimited. */
  availableSpots: number | null;
};

/**
 * Approved applicants eligible for the next RSVP wave.
 *
 * Anyone who already has an RSVP response for this event is ineligible —
 * including `accepted`, `declined`, `timed_out`, and `pending`. A timed-out
 * (or expired unanswered) invitation is a used RSVP opportunity and is not
 * offered again. Callers must not assume the returned set is the wave: use
 * `selectRsvpWaveInvitees` to cap by remaining capacity.
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

  const [{ value: attendeeCount }] = await db
    .select({ value: count() })
    .from(eventAttendees)
    .where(eq(eventAttendees.eventId, eventId));

  const capacity = eventRow.capacity ?? null;
  const availableSpots =
    capacity === null ? null : Math.max(0, capacity - Number(attendeeCount));

  const blockingResponses = alias(
    eventRsvpResponses,
    'blocking_rsvp_responses',
  );
  const blockingWaves = alias(eventRsvpWaves, 'blocking_rsvp_waves');

  const applicants = await db
    .select({
      userId: eventApplications.userId,
      email: user.email,
      applicationId: eventApplications.id,
      applicationCreatedAt: eventApplications.createdAt,
    })
    .from(eventApplications)
    .innerJoin(
      applicationStatuses,
      eq(eventApplications.statusId, applicationStatuses.id),
    )
    .innerJoin(user, eq(eventApplications.userId, user.id))
    .where(
      and(
        eq(eventApplications.eventId, eventId),
        eq(applicationStatuses.label, APPROVED_APPLICATION_STATUS_LABEL),
        notExists(
          db
            .select({ one: eventAttendees.userId })
            .from(eventAttendees)
            .where(
              and(
                eq(eventAttendees.eventId, eventId),
                eq(eventAttendees.userId, eventApplications.userId),
              ),
            ),
        ),
        notExists(
          db
            .select({ one: blockingResponses.id })
            .from(blockingResponses)
            .innerJoin(
              blockingWaves,
              eq(blockingResponses.rsvpWaveId, blockingWaves.id),
            )
            .where(
              and(
                eq(blockingWaves.eventId, eventId),
                eq(blockingResponses.userId, eventApplications.userId),
              ),
            ),
        ),
      ),
    );

  return {
    applicants,
    capacity,
    attendeeCount: Number(attendeeCount),
    availableSpots,
  };
}
