import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import {
  events,
  eventRsvpWaves,
  eventRsvpResponses,
  rsvpStatuses,
} from '@/db/schema';
import {
  getEligibleRsvpApplicants,
  type EligibleRsvpApplicant,
} from '@/lib/rsvp/eligible-rsvp-applicants';
import { publishRsvpInvitation } from '@/lib/rsvp/rsvp-invitation-queue';
import { timeoutExpiredRsvpResponses } from '@/lib/rsvp/timeout-expired-rsvp-responses';
import { db } from '@/utils/db';

const PENDING_RSVP_STATUS_LABEL = 'pending';

export type RsvpWaveRecord = {
  id: string;
  eventId: string;
  wave: number;
  respondBy: Date;
  createdAt: Date;
};

export type RsvpWaveQueueFailure = {
  userId: string;
  email: string;
  error: string;
};

export type SendRsvpWaveSuccess = {
  success: true;
  wave: RsvpWaveRecord;
  eligibleApplicantCount: number;
  responsesCreated: number;
  invitationsQueued: number;
  queueFailures: RsvpWaveQueueFailure[];
};

export type SendRsvpWaveFailure = {
  success: false;
  error: string;
};

export type SendRsvpWaveResult = SendRsvpWaveSuccess | SendRsvpWaveFailure;

/**
 * Creates the next RSVP wave and pending responses for eligible applicants,
 * then queues one RSVP invitation message per response (delivery happens
 * asynchronously via `processRsvpInvitation`). Refuses the wave when eligible
 * count exceeds remaining capacity (no invite ranking). Used by the admin
 * action and `runScheduledRsvpWaves`.
 */
export async function sendRsvpWave(
  eventId: string,
  respondBy: Date,
): Promise<SendRsvpWaveResult> {
  if (Number.isNaN(respondBy.getTime()) || respondBy.getTime() <= Date.now()) {
    return {
      success: false,
      error: 'RSVP deadline must be a valid future date.',
    };
  }

  const [eventRow] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!eventRow) {
    return { success: false, error: 'Event not found.' };
  }

  const [pendingRsvpStatus] = await db
    .select({ id: rsvpStatuses.id })
    .from(rsvpStatuses)
    .where(eq(rsvpStatuses.label, PENDING_RSVP_STATUS_LABEL))
    .limit(1);

  if (!pendingRsvpStatus) {
    return {
      success: false,
      error: 'RSVP statuses are not configured (missing pending).',
    };
  }

  await timeoutExpiredRsvpResponses({ eventId });

  const eligibility = await getEligibleRsvpApplicants(eventId);
  if (!eligibility) {
    return { success: false, error: 'Event not found.' };
  }

  if (eligibility.availableSpots === 0) {
    return {
      success: false,
      error: 'No available spots remaining for this event.',
    };
  }

  if (eligibility.applicants.length === 0) {
    return {
      success: false,
      error: 'No eligible applicants for the next RSVP wave.',
    };
  }

  if (
    eligibility.availableSpots !== null &&
    eligibility.applicants.length > eligibility.availableSpots
  ) {
    return {
      success: false,
      error:
        `Cannot send RSVP wave: ${eligibility.applicants.length} eligible ` +
        `applicants exceed ${eligibility.availableSpots} available spots, and ` +
        `no ranking or waitlist order exists to choose a subset.`,
    };
  }

  const [latestWave] = await db
    .select({ wave: eventRsvpWaves.wave })
    .from(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, eventId))
    .orderBy(desc(eventRsvpWaves.wave))
    .limit(1);

  const nextWaveNumber = (latestWave?.wave ?? 0) + 1;

  const { applicants } = eligibility;

  let waveRecord: RsvpWaveRecord;
  let invitedApplicants: EligibleRsvpApplicant[];
  let insertedResponses: { id: string; userId: string }[];

  try {
    const created = await db.transaction(async (tx) => {
      const [wave] = await tx
        .insert(eventRsvpWaves)
        .values({
          eventId,
          wave: nextWaveNumber,
          respondBy,
        })
        .returning({
          id: eventRsvpWaves.id,
          eventId: eventRsvpWaves.eventId,
          wave: eventRsvpWaves.wave,
          respondBy: eventRsvpWaves.respondBy,
          createdAt: eventRsvpWaves.createdAt,
        });

      const insertedResponses = await tx
        .insert(eventRsvpResponses)
        .values(
          applicants.map((applicant) => ({
            rsvpWaveId: wave.id,
            userId: applicant.userId,
            statusId: pendingRsvpStatus.id,
          })),
        )
        .returning({
          id: eventRsvpResponses.id,
          userId: eventRsvpResponses.userId,
        });

      return {
        wave,
        insertedResponses,
        invitedApplicants: applicants,
      };
    });

    waveRecord = {
      id: created.wave.id,
      eventId: created.wave.eventId,
      wave: created.wave.wave,
      respondBy: created.wave.respondBy!,
      createdAt: created.wave.createdAt,
    };
    invitedApplicants = created.invitedApplicants;
    insertedResponses = created.insertedResponses;
  } catch (error) {
    console.error('[sendRsvpWave] database error:', error);
    return {
      success: false,
      error: 'Failed to create RSVP wave and responses.',
    };
  }

  const emailByUserId = new Map(
    invitedApplicants.map((applicant) => [applicant.userId, applicant.email]),
  );
  const queueFailures: RsvpWaveQueueFailure[] = [];
  let invitationsQueued = 0;

  for (const response of insertedResponses) {
    try {
      await publishRsvpInvitation(response.id);
      // Consumer may already have processed and marked this 'sent' by the
      // time this update runs — never regress it back to 'queued'.
      await db
        .update(eventRsvpResponses)
        .set({
          invitationEmailStatus: 'queued',
          invitationEmailQueuedAt: new Date(),
        })
        .where(
          and(
            eq(eventRsvpResponses.id, response.id),
            eq(eventRsvpResponses.invitationEmailStatus, 'unsent'),
          ),
        );
      invitationsQueued += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown queue publish error';
      console.error(
        `[sendRsvpWave] failed to queue invitation for user ${response.userId}:`,
        error,
      );
      queueFailures.push({
        userId: response.userId,
        email: emailByUserId.get(response.userId) ?? '',
        error: message,
      });
    }
  }

  return {
    success: true,
    wave: waveRecord,
    eligibleApplicantCount: applicants.length,
    responsesCreated: invitedApplicants.length,
    invitationsQueued,
    queueFailures,
  };
}
