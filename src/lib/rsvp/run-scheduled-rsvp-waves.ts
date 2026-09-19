import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { eventRsvpWaves, events } from '@/db/schema';
import {
  RSVP_WAVE_ALREADY_ACTIVE_MESSAGE,
  RSVP_WAVE_EVENT_STARTED_MESSAGE,
} from '@/lib/rsvp/constants';
import { isRsvpWaveActive } from '@/lib/rsvp/compute-rsvp-respond-by';
import { sendRsvpWave } from '@/lib/rsvp/send-rsvp-wave';
import { timeoutExpiredRsvpResponses } from '@/lib/rsvp/timeout-expired-rsvp-responses';
import { db } from '@/utils/db';

const NO_SPOTS_MESSAGE = 'No available spots remaining for this event.';
const NO_ELIGIBLE_MESSAGE = 'No eligible applicants for the next RSVP wave.';

export type ScheduledEventWaveResult = {
  eventId: string;
  eventName: string;
  action:
    | 'sent'
    | 'skipped_no_prior_wave'
    | 'skipped_active_wave'
    | 'skipped_no_eligible'
    | 'skipped_no_capacity'
    | 'skipped_event_started'
    | 'failed';
  detail?: string;
  waveNumber?: number;
  eligibleApplicantCount?: number;
  responsesCreated?: number;
  invitationsQueued?: number;
};

export type RunScheduledRsvpWavesResult = {
  timedOutCount: number;
  eventsConsidered: number;
  wavesSent: number;
  results: ScheduledEventWaveResult[];
};

export type RunScheduledRsvpWavesOptions = {
  /** Clock override for tests. Defaults to now. */
  now?: Date;
};

/**
 * Follow-up RSVP waves for events that already have an admin-started wave.
 *
 * Thin scheduler, invoked once daily. Skip when there is no prior wave or the
 * latest wave is still active (`respond_by > now`). Expired pending rows are
 * resolved with `timeoutExpiredRsvpResponses`, then `sendRsvpWave` owns
 * selection, window, locking, and invitations. Does not create a first wave.
 * A gap between `respond_by` and the next daily run is expected.
 */
export async function runScheduledRsvpWaves(
  options: RunScheduledRsvpWavesOptions = {},
): Promise<RunScheduledRsvpWavesResult> {
  const now = options.now ?? new Date();

  const { timedOutCount } = await timeoutExpiredRsvpResponses({ now });

  const candidateEvents = await db
    .select({
      id: events.id,
      name: events.name,
    })
    .from(events)
    .where(eq(events.hasApplication, true));

  const results: ScheduledEventWaveResult[] = [];
  let wavesSent = 0;

  for (const event of candidateEvents) {
    const result = await processEventScheduledWave(event.id, event.name, now);
    results.push(result);
    if (result.action === 'sent') {
      wavesSent += 1;
    }
  }

  return {
    timedOutCount,
    eventsConsidered: candidateEvents.length,
    wavesSent,
    results,
  };
}

async function processEventScheduledWave(
  eventId: string,
  eventName: string,
  now: Date,
): Promise<ScheduledEventWaveResult> {
  const [latestWave] = await db
    .select({
      wave: eventRsvpWaves.wave,
      respondBy: eventRsvpWaves.respondBy,
    })
    .from(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, eventId))
    .orderBy(desc(eventRsvpWaves.wave))
    .limit(1);

  if (!latestWave) {
    return {
      eventId,
      eventName,
      action: 'skipped_no_prior_wave',
      detail: 'First RSVP wave must be started by an admin.',
    };
  }

  if (isRsvpWaveActive(latestWave.respondBy, now)) {
    return {
      eventId,
      eventName,
      action: 'skipped_active_wave',
      detail: 'The latest RSVP wave is still collecting responses.',
      waveNumber: latestWave.wave,
    };
  }

  const sendResult = await sendRsvpWave(eventId, { now });
  if (!sendResult.success) {
    return mapSendFailure(eventId, eventName, sendResult.error);
  }

  return {
    eventId,
    eventName,
    action: 'sent',
    waveNumber: sendResult.wave.wave,
    eligibleApplicantCount: sendResult.eligibleApplicantCount,
    responsesCreated: sendResult.responsesCreated,
    invitationsQueued: sendResult.invitationsQueued,
  };
}

function mapSendFailure(
  eventId: string,
  eventName: string,
  error: string,
): ScheduledEventWaveResult {
  if (error === RSVP_WAVE_ALREADY_ACTIVE_MESSAGE) {
    return {
      eventId,
      eventName,
      action: 'skipped_active_wave',
      detail: error,
    };
  }
  if (error === RSVP_WAVE_EVENT_STARTED_MESSAGE) {
    return {
      eventId,
      eventName,
      action: 'skipped_event_started',
      detail: error,
    };
  }
  if (error === NO_SPOTS_MESSAGE) {
    return {
      eventId,
      eventName,
      action: 'skipped_no_capacity',
      detail: error,
    };
  }
  if (error === NO_ELIGIBLE_MESSAGE) {
    return {
      eventId,
      eventName,
      action: 'skipped_no_eligible',
      detail: error,
    };
  }
  return {
    eventId,
    eventName,
    action: 'failed',
    detail: error,
  };
}
