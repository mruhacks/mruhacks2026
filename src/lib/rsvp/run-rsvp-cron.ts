import 'server-only';

import {
  requeuePendingRsvpInvitations,
  type RequeuePendingRsvpInvitationsResult,
} from '@/lib/rsvp/requeue-pending-rsvp-invitations';
import {
  runScheduledRsvpWaves,
  type RunScheduledRsvpWavesResult,
} from '@/lib/rsvp/run-scheduled-rsvp-waves';

export type RunRsvpCronResult = {
  waves: RunScheduledRsvpWavesResult;
  sweep: RequeuePendingRsvpInvitationsResult;
};

/**
 * The single scheduled RSVP step: send any due follow-up waves, then requeue
 * invitations whose original queue publish never landed. The sweep still runs
 * if the wave step throws (and vice versa); any failure is rethrown afterwards
 * so the cron run is reported as failed.
 */
export async function runRsvpCron(): Promise<RunRsvpCronResult> {
  const [waves, sweep] = [
    await settle(runScheduledRsvpWaves()),
    await settle(requeuePendingRsvpInvitations()),
  ];

  if (waves.status === 'rejected' || sweep.status === 'rejected') {
    throw new AggregateError(
      [waves, sweep]
        .filter((step) => step.status === 'rejected')
        .map((step) => step.reason),
      'Scheduled RSVP run failed.',
    );
  }

  return { waves: waves.value, sweep: sweep.value };
}

function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return Promise.allSettled([promise]).then(([result]) => result);
}
