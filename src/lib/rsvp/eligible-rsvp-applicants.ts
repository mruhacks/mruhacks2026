import 'server-only';

import { and, count, eq, gte, isNull, notExists, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  applicationStatuses,
  eventApplications,
  eventAttendees,
  eventRsvpResponses,
  eventRsvpWaves,
  events,
  rsvpStatuses,
  user,
} from '@/db/schema';
import { db } from '@/utils/db';

/** DB label in application_statuses for an approved application. */
const APPROVED_APPLICATION_STATUS_LABEL = 'approved';

export type EligibleRsvpApplicant = {
  userId: string;
  email: string;
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
 * Expired pending invites do not block eligibility (`pending` only blocks
 * while `respondBy` is null or still in the future). Does not truncate by
 * capacity — callers must refuse when `applicants.length` exceeds
 * `availableSpots` (no invite ranking yet; `waitlist_position` applies only
 * to waitlisted applications).
 */
export async function getEligibleRsvpApplicants(
  eventId: string,
  now: Date = new Date(),
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

  const blockingResponses = alias(eventRsvpResponses, 'blocking_rsvp_responses');
  const blockingWaves = alias(eventRsvpWaves, 'blocking_rsvp_waves');
  const blockingStatuses = alias(rsvpStatuses, 'blocking_rsvp_statuses');

  const applicants = await db
    .select({
      userId: eventApplications.userId,
      email: user.email,
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
            .innerJoin(
              blockingStatuses,
              eq(blockingResponses.statusId, blockingStatuses.id),
            )
            .where(
              and(
                eq(blockingWaves.eventId, eventId),
                eq(blockingResponses.userId, eventApplications.userId),
                or(
                  eq(blockingStatuses.label, 'accepted'),
                  eq(blockingStatuses.label, 'declined'),
                  and(
                    eq(blockingStatuses.label, 'pending'),
                    or(
                      isNull(blockingWaves.respondBy),
                      gte(blockingWaves.respondBy, now),
                    ),
                  ),
                ),
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
