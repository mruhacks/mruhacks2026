import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';

import {
  events,
  eventRsvpWaves,
  eventInvitations,
  eventParticipants,
} from '@/db/schema';
import {
  hasAnyStatus,
  hasStatus,
  statusIdOf,
} from '@/lib/participation/server';
import { WAVE_ELIGIBLE_STATUSES } from '@/lib/participation/status';
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
import { timeoutExpiredInvitations } from '@/lib/rsvp/timeout-expired-invitations';
import { db } from '@/utils/db';

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
  /** The still-open wave this send closed early, when `closeActiveWave`. */
  closedWave: { wave: number; timedOutCount: number } | null;
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
  /**
   * Send even while the latest wave is still open: that wave closes now, and
   * its unanswered invitations time out, in the same transaction as the new
   * wave. Without it a send during an open wave is refused.
   */
  closeActiveWave?: boolean;
};

class SendRsvpWaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SendRsvpWaveError';
  }
}

/**
 * Creates the next RSVP wave: moves the selected invitees to `invited`,
 * creates one invitation per invitee, then queues one RSVP invitation
 * message per invitation (delivery happens asynchronously via
 * `processRsvpInvitation`).
 *
 * `respond_by` is `created_at + events.rsvp_response_window_hours`. Refuses
 * when a wave is still active (unless `closeActiveWave`), the event has started, remaining spots are 0,
 * or nobody is eligible. Invitee order (waitlist position) lives in
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

  await timeoutExpiredInvitations({ eventId, now });

  const [latestWave] = await db
    .select({
      wave: eventRsvpWaves.wave,
      respondBy: eventRsvpWaves.respondBy,
    })
    .from(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, eventId))
    .orderBy(desc(eventRsvpWaves.wave))
    .limit(1);

  if (
    latestWave &&
    isRsvpWaveActive(latestWave.respondBy, now) &&
    !options.closeActiveWave
  ) {
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
  let closedWave: SendRsvpWaveSuccess['closedWave'];

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
          id: eventRsvpWaves.id,
          wave: eventRsvpWaves.wave,
          respondBy: eventRsvpWaves.respondBy,
        })
        .from(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventId))
        .orderBy(desc(eventRsvpWaves.wave))
        .limit(1);

      let closed: SendRsvpWaveSuccess['closedWave'] = null;
      if (
        lockedLatestWave &&
        isRsvpWaveActive(lockedLatestWave.respondBy, now)
      ) {
        if (!options.closeActiveWave) {
          throw new SendRsvpWaveError(RSVP_WAVE_ALREADY_ACTIVE_MESSAGE);
        }
        // Close the open wave now. The event lock serializes this with
        // `submitRsvpResponse`, which re-reads `respond_by` under the same
        // lock, so nobody can accept into the closed wave afterwards.
        await tx
          .update(eventRsvpWaves)
          .set({ respondBy: now })
          .where(eq(eventRsvpWaves.id, lockedLatestWave.id));
        const timedOut = await tx
          .update(eventParticipants)
          .set({ statusId: statusIdOf('timed_out') })
          .where(
            and(
              hasStatus('invited'),
              inArray(
                eventParticipants.id,
                tx
                  .select({ id: eventInvitations.participantId })
                  .from(eventInvitations)
                  .where(eq(eventInvitations.rsvpWaveId, lockedLatestWave.id)),
              ),
            ),
          )
          .returning({ id: eventParticipants.id });
        closed = {
          wave: lockedLatestWave.wave,
          timedOutCount: timedOut.length,
        };
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

      // Compare-and-set: only participants still waitlisted move.
      // Anyone a reviewer changed since eligibility was read is skipped
      // rather than invited out from under that decision.
      const moved = await tx
        .update(eventParticipants)
        .set({ statusId: statusIdOf('invited'), waitlistPosition: null })
        .where(
          and(
            eq(eventParticipants.eventId, eventId),
            inArray(
              eventParticipants.id,
              invitees.map((applicant) => applicant.participantId),
            ),
            hasAnyStatus(WAVE_ELIGIBLE_STATUSES),
          ),
        )
        .returning({ id: eventParticipants.id });
      const movedIds = new Set(moved.map((row) => row.id));
      const invitedApplicants = invitees.filter((applicant) =>
        movedIds.has(applicant.participantId),
      );
      if (invitedApplicants.length === 0) {
        throw new SendRsvpWaveError(
          'No eligible applicants for the next RSVP wave.',
        );
      }

      const userIdByParticipantId = new Map(
        invitedApplicants.map((a) => [a.participantId, a.userId]),
      );
      const inserted = await tx
        .insert(eventInvitations)
        .values(
          invitedApplicants.map((applicant) => ({
            rsvpWaveId: wave.id,
            participantId: applicant.participantId,
          })),
        )
        .returning({
          id: eventInvitations.id,
          participantId: eventInvitations.participantId,
        });

      return {
        wave,
        closed,
        insertedResponses: inserted.map((row) => ({
          id: row.id,
          userId: userIdByParticipantId.get(row.participantId)!,
        })),
        invitedApplicants,
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
    closedWave = created.closed;
  } catch (error) {
    if (error instanceof SendRsvpWaveError) {
      return { success: false, error: error.message };
    }
    console.error('[rsvp/send-rsvp-wave] database error', error);
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

  // Publish concurrently — a wave can be hundreds of invitees, and awaiting
  // each publish (plus its own internal retries) one at a time would hold
  // the caller's response open for the entire wave.
  const publishResults = await Promise.allSettled(
    insertedResponses.map(async (response) => {
      await publishRsvpInvitation(response.id);
      // Consumer may already have processed and marked this 'sent' by the
      // time this update runs — never regress it back to 'queued'.
      await db
        .update(eventInvitations)
        .set({
          invitationEmailStatus: 'queued',
          invitationEmailQueuedAt: new Date(),
        })
        .where(
          and(
            eq(eventInvitations.id, response.id),
            eq(eventInvitations.invitationEmailStatus, 'unsent'),
          ),
        );
    }),
  );

  publishResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      invitationsQueued += 1;
      return;
    }

    const response = insertedResponses[index];
    const message =
      result.reason instanceof Error
        ? result.reason.message
        : 'Unknown queue publish error';
    console.error('[rsvp/send-rsvp-wave] failed to queue invitation', {
      userId: response.userId,
      error: result.reason,
    });
    queueFailures.push({
      userId: response.userId,
      email: emailByUserId.get(response.userId) ?? '',
      error: message,
    });
  });

  return {
    success: true,
    wave: waveRecord,
    closedWave,
    eligibleApplicantCount: eligibility.applicants.length,
    responsesCreated: invitedApplicants.length,
    invitationsQueued,
    queueFailures,
  };
}
