import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { eventRsvpWaves, events } from '@/db/schema';
import { getEligibleRsvpApplicants } from '@/lib/rsvp/eligible-rsvp-applicants';
import { sendRsvpWave } from '@/lib/rsvp/send-rsvp-wave';
import { timeoutExpiredRsvpResponses } from '@/lib/rsvp/timeout-expired-rsvp-responses';
import { db } from '@/utils/db';

/** Fallback RSVP window when a prior wave has no usable duration. */
const DEFAULT_RESPOND_BY_MS = 48 * 60 * 60 * 1000;

export type ScheduledEventWaveResult = {
  eventId: string;
  eventName: string;
  action:
    | 'sent'
    | 'skipped_no_prior_wave'
    | 'skipped_already_ran_today'
    | 'skipped_no_eligible'
    | 'skipped_no_capacity'
    | 'skipped_exceeds_capacity'
    | 'failed';
  detail?: string;
  waveNumber?: number;
  eligibleApplicantCount?: number;
  responsesCreated?: number;
  emailsSent?: number;
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

function sameUtcCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Next respond-by deadline for an automatic wave: reuse the previous wave's
 * invitation window (respondBy - createdAt), or fall back to 48 hours.
 */
export function computeScheduledRespondBy(
  previousWave: { respondBy: Date | null; createdAt: Date },
  now: Date = new Date(),
): Date {
  if (previousWave.respondBy) {
    const windowMs =
      previousWave.respondBy.getTime() - previousWave.createdAt.getTime();
    if (windowMs > 0) {
      return new Date(now.getTime() + windowMs);
    }
  }
  return new Date(now.getTime() + DEFAULT_RESPOND_BY_MS);
}

/**
 * Daily follow-up waves for events that already have an admin-started wave.
 * Does not create a first wave. Idempotent via same-UTC-day skip and
 * post-send pending responses clearing eligibility.
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
      id: eventRsvpWaves.id,
      wave: eventRsvpWaves.wave,
      respondBy: eventRsvpWaves.respondBy,
      createdAt: eventRsvpWaves.createdAt,
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

  if (sameUtcCalendarDay(latestWave.createdAt, now)) {
    return {
      eventId,
      eventName,
      action: 'skipped_already_ran_today',
      detail: 'A wave was already created for this event today (UTC).',
      waveNumber: latestWave.wave,
    };
  }

  const eligibility = await getEligibleRsvpApplicants(eventId, now);
  if (!eligibility) {
    return {
      eventId,
      eventName,
      action: 'failed',
      detail: 'Event not found during eligibility check.',
    };
  }

  if (eligibility.availableSpots === 0) {
    return {
      eventId,
      eventName,
      action: 'skipped_no_capacity',
      detail: 'No available spots remaining.',
      eligibleApplicantCount: eligibility.applicants.length,
    };
  }

  if (eligibility.applicants.length === 0) {
    return {
      eventId,
      eventName,
      action: 'skipped_no_eligible',
      detail: 'No eligible applicants for the next wave.',
      eligibleApplicantCount: 0,
    };
  }

  if (
    eligibility.availableSpots !== null &&
    eligibility.applicants.length > eligibility.availableSpots
  ) {
    // No invite ranking for approved applicants yet — skip rather than pick a subset.
    return {
      eventId,
      eventName,
      action: 'skipped_exceeds_capacity',
      detail:
        `${eligibility.applicants.length} eligible applicants exceed ` +
        `${eligibility.availableSpots} available spots; no ranking/waitlist ` +
        `order exists to choose a subset.`,
      eligibleApplicantCount: eligibility.applicants.length,
    };
  }

  const respondBy = computeScheduledRespondBy(latestWave, now);
  const sendResult = await sendRsvpWave(eventId, respondBy);

  if (!sendResult.success) {
    const [afterWave] = await db
      .select({
        wave: eventRsvpWaves.wave,
        createdAt: eventRsvpWaves.createdAt,
      })
      .from(eventRsvpWaves)
      .where(eq(eventRsvpWaves.eventId, eventId))
      .orderBy(desc(eventRsvpWaves.wave))
      .limit(1);

    if (afterWave && sameUtcCalendarDay(afterWave.createdAt, now)) {
      return {
        eventId,
        eventName,
        action: 'skipped_already_ran_today',
        detail: sendResult.error,
        waveNumber: afterWave.wave,
      };
    }

    return {
      eventId,
      eventName,
      action: 'failed',
      detail: sendResult.error,
      eligibleApplicantCount: eligibility.applicants.length,
    };
  }

  return {
    eventId,
    eventName,
    action: 'sent',
    waveNumber: sendResult.wave.wave,
    eligibleApplicantCount: sendResult.eligibleApplicantCount,
    responsesCreated: sendResult.responsesCreated,
    emailsSent: sendResult.emailsSent,
  };
}
