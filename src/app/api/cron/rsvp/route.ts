import { handleCronRequest } from '@/app/api/cron/handle-cron-request';
import { runRsvpCron } from '@/lib/rsvp/run-rsvp-cron';
import { fail } from '@/utils/action-result';

/**
 * Cron entrypoint for the scheduled RSVP step (follow-up waves + invitation
 * requeue sweep). Requires `Authorization: Bearer <CRON_SECRET>`.
 * Schedule: hourly via `workers/rsvp-cron/wrangler.json`.
 */
async function handle(request: Request): Promise<Response> {
  return handleCronRequest(request, {
    logLabel: 'cron/rsvp',
    failureBody: fail('Scheduled RSVP run failed.'),
    run: async () => {
      const result = await runRsvpCron();
      console.info('[cron/rsvp] completed', {
        timedOutCount: result.waves.timedOutCount,
        eventsConsidered: result.waves.eventsConsidered,
        wavesSent: result.waves.wavesSent,
        sweep: result.sweep,
      });
      return result;
    },
  });
}

export const GET = handle;
export const POST = handle;
