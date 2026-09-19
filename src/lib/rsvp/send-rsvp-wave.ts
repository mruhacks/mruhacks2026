import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import {
  events,
  eventRsvpWaves,
  eventRsvpResponses,
  rsvpStatuses,
} from '@/db/schema';
import {
  RSVP_WAVE_ALREADY_ACTIVE_MESSAGE,
  RSVP_WAVE_EVENT_STARTED_MESSAGE,
} from '@/lib/rsvp/constants';
import {
  computeRsvpRespondBy,
  isRsvpWaveActive,
} from '@/lib/rsvp/compute-rsvp-respond-by';
import {
  getEligibleRsvpApplicants,
  type EligibleRsvpApplicant,
} from '@/lib/rsvp/eligible-rsvp-applicants';
import { publishRsvpInvitation } from '@/lib/rsvp/rsvp-invitation-queue';
import { selectRsvpWaveInvitees } from '@/lib/rsvp/select-rsvp-wave-invitees';
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

export type SendRsvpWaveOptions = {
  /** Clock override for tests. Defaults to now. */
  now?: Date;
};

class SendRsvpWaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SendRsvpWaveError';
  }
}

/**
 * Creates the next RSVP wave and pending responses for selected invitees,
 * then queues one RSVP invitation message per response (delivery happens
 * asynchronously via `processRsvpInvitation`).
 *
 * `respond_by` is `created_at + events.rsvp_response_window_hours`. Refuses
 * when a wave is still active, the event has started, remaining spots are 0,
 * or nobody is eligible. Invitee order (oldest application first) lives in
 * `selectRsvpWaveInvitees`.
 */
export async function sendRsvpWave(
  eventId: string,
  options: SendRsvpWaveOptions = {},
): Promise<SendRsvpWaveResult> {
  const now = options.now ?? new Date();

  const [eventRow] = await db
    .select({
      id: events.id,
      startsAt: events.startsAt,
      rsvpResponseWindowHours: events.rsvpResponseWindowHours,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!eventRow) {
    return { success: false, error: 'Event not found.' };
  }

  if (eventRow.startsAt && now.getTime() >= eventRow.startsAt.getTime()) {
    return { success: false, error: RSVP_WAVE_EVENT_STARTED_MESSAGE };
  }

  if (
    !Number.isInteger(eventRow.rsvpResponseWindowHours) ||
    eventRow.rsvpResponseWindowHours < 1
  ) {
    return {
      success: false,
      error: 'RSVP response window hours are not configured.',
    };
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

  await timeoutExpiredRsvpResponses({ eventId, now });

  const [latestWave] = await db
    .select({
      wave: eventRsvpWaves.wave,
      respondBy: eventRsvpWaves.respondBy,
    })
    .from(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, eventId))
    .orderBy(desc(eventRsvpWaves.wave))
    .limit(1);

  if (latestWave && isRsvpWaveActive(latestWave.respondBy, now)) {
    return { success: false, error: RSVP_WAVE_ALREADY_ACTIVE_MESSAGE };
  }

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

  const invitees = selectRsvpWaveInvitees(
    eligibility.applicants,
    eligibility.availableSpots,
  );
  if (invitees.length === 0) {
    return {
      success: false,
      error: 'No eligible applicants for the next RSVP wave.',
    };
  }

  const respondBy = computeRsvpRespondBy(now, eventRow.rsvpResponseWindowHours);

  let waveRecord: RsvpWaveRecord;
  let invitedApplicants: EligibleRsvpApplicant[];
  let insertedResponses: { id: string; userId: string }[];

  try {
    const created = await db.transaction(async (tx) => {
      const [lockedEvent] = await tx
        .select({
          id: events.id,
          startsAt: events.startsAt,
        })
        .from(events)
        .where(eq(events.id, eventId))
        .for('update')
        .limit(1);

      if (!lockedEvent) {
        throw new SendRsvpWaveError('Event not found.');
      }

      if (
        lockedEvent.startsAt &&
        now.getTime() >= lockedEvent.startsAt.getTime()
      ) {
        throw new SendRsvpWaveError(RSVP_WAVE_EVENT_STARTED_MESSAGE);
      }

      const [lockedLatestWave] = await tx
        .select({
          wave: eventRsvpWaves.wave,
          respondBy: eventRsvpWaves.respondBy,
        })
        .from(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventId))
        .orderBy(desc(eventRsvpWaves.wave))
        .limit(1);

      if (
        lockedLatestWave &&
        isRsvpWaveActive(lockedLatestWave.respondBy, now)
      ) {
        throw new SendRsvpWaveError(RSVP_WAVE_ALREADY_ACTIVE_MESSAGE);
      }

      const lockedNextWaveNumber = (lockedLatestWave?.wave ?? 0) + 1;

      const [wave] = await tx
        .insert(eventRsvpWaves)
        .values({
          eventId,
          wave: lockedNextWaveNumber,
          respondBy,
          createdAt: now,
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
          invitees.map((applicant) => ({
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
        invitedApplicants: invitees,
      };
    });

    waveRecord = {
      id: created.wave.id,
      eventId: created.wave.eventId,
      wave: created.wave.wave,
      respondBy: created.wave.respondBy,
      createdAt: created.wave.createdAt,
    };
    invitedApplicants = created.invitedApplicants;
    insertedResponses = created.insertedResponses;
  } catch (error) {
    if (error instanceof SendRsvpWaveError) {
      return { success: false, error: error.message };
    }
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
    eligibleApplicantCount: eligibility.applicants.length,
    responsesCreated: invitedApplicants.length,
    invitationsQueued,
    queueFailures,
  };
}
