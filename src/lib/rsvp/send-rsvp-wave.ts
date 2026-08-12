import 'server-only';

import { desc, eq } from 'drizzle-orm';

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
import {
  getBackgroundAuthHeaders,
  sendRsvpMagicLink,
} from '@/lib/rsvp/send-rsvp-magic-link';
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

export type RsvpWaveEmailFailure = {
  userId: string;
  email: string;
  error: string;
};

export type SendRsvpWaveSuccess = {
  success: true;
  wave: RsvpWaveRecord;
  eligibleApplicantCount: number;
  responsesCreated: number;
  emailsSent: number;
  emailFailures: RsvpWaveEmailFailure[];
};

export type SendRsvpWaveFailure = {
  success: false;
  error: string;
};

export type SendRsvpWaveResult = SendRsvpWaveSuccess | SendRsvpWaveFailure;

/**
 * Creates the next RSVP wave, pending responses for eligible applicants, and
 * RSVP magic-link emails. Refuses the wave when eligible count exceeds
 * remaining capacity (no invite ranking). Used by the admin action and
 * `runScheduledRsvpWaves`.
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
    .select({ id: events.id, name: events.name })
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

      if (applicants.length === 0) {
        return {
          wave,
          responsesCreated: 0,
          invitedApplicants: [] as EligibleRsvpApplicant[],
        };
      }

      const insertedResponses = await tx
        .insert(eventRsvpResponses)
        .values(
          applicants.map((applicant) => ({
            rsvpWaveId: wave.id,
            userId: applicant.userId,
            statusId: pendingRsvpStatus.id,
          })),
        )
        .returning({ userId: eventRsvpResponses.userId });

      const invitedUserIds = new Set(
        insertedResponses.map((response) => response.userId),
      );

      return {
        wave,
        responsesCreated: insertedResponses.length,
        invitedApplicants: applicants.filter((applicant) =>
          invitedUserIds.has(applicant.userId),
        ),
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
  } catch (error) {
    console.error('[sendRsvpWave] database error:', error);
    return {
      success: false,
      error: 'Failed to create RSVP wave and responses.',
    };
  }

  const emailFailures: RsvpWaveEmailFailure[] = [];
  let emailsSent = 0;

  let authHeaders: Headers;
  try {
    authHeaders = getBackgroundAuthHeaders();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Missing BETTER_AUTH_URL';
    for (const applicant of invitedApplicants) {
      emailFailures.push({
        userId: applicant.userId,
        email: applicant.email,
        error: message,
      });
    }
    return {
      success: true,
      wave: waveRecord,
      eligibleApplicantCount: applicants.length,
      responsesCreated: invitedApplicants.length,
      emailsSent: 0,
      emailFailures,
    };
  }

  for (const applicant of invitedApplicants) {
    try {
      await sendRsvpMagicLink({
        email: applicant.email,
        eventId,
        headers: authHeaders,
      });
      emailsSent += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown magic-link error';
      console.error(
        `[sendRsvpWave] magic link failed for user ${applicant.userId}:`,
        error,
      );
      emailFailures.push({
        userId: applicant.userId,
        email: applicant.email,
        error: message,
      });
    }
  }

  return {
    success: true,
    wave: waveRecord,
    eligibleApplicantCount: applicants.length,
    responsesCreated: invitedApplicants.length,
    emailsSent,
    emailFailures,
  };
}
