import { handleCronRequest } from '@/app/api/cron/handle-cron-request';
import { runScheduledRsvpWaves } from '@/lib/rsvp/run-scheduled-rsvp-waves';
import { fail } from '@/utils/action-result';

/**
 * Cron entrypoint for follow-up RSVP waves. Requires
 * `Authorization: Bearer <CRON_SECRET>`. Schedule: `vercel.json` (UTC midnight).
 */
async function handle(request: Request): Promise<Response> {
  return handleCronRequest(request, {
    logLabel: '[cron/rsvp-waves]',
    failureBody: fail('Scheduled RSVP wave run failed.'),
    run: async () => {
      const result = await runScheduledRsvpWaves();
      console.info('[cron/rsvp-waves] completed', {
        timedOutCount: result.timedOutCount,
        eventsConsidered: result.eventsConsidered,
        wavesSent: result.wavesSent,
      });
      return result;
    },
  });
}

export const GET = handle;
export const POST = handle;
