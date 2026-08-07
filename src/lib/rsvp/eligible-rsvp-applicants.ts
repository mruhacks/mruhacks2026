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

/** DB label in application_statuses for an accepted application. */
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
  /**
   * Remaining spots when capacity is set (`capacity - attendeeCount`, floored
   * at 0). Null when capacity is unlimited.
   */
  availableSpots: number | null;
};

/**
 * Approved applicants who may receive the next RSVP wave.
 *
 * Rules:
 * - Must have an approved application
 * - Must not already be an attendee
 * - Must not have accepted or declined any prior RSVP for this event
 * - Must not have an active pending RSVP (deadline still in the future, or
 *   missing deadline)
 * - Timed-out prior invites and never-invited applicants remain eligible
 *
 * Call `timeoutExpiredRsvpResponses` first so expired pending rows become
 * `timed_out` before this query runs.
 *
 * Does not truncate by capacity — callers decide how to handle
 * `applicants.length > availableSpots` (there is no ranking/waitlist order).
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
