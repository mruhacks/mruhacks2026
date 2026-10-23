import { handleCronRequest } from '../handle-cron-request';
import * as Campaigns from '@/lib/campaigns/server';
import * as Rsvp from '@/lib/rsvp/server';
import { fail } from '@/utils/action-result';

/**
 * The single hourly cron entrypoint, called by the Cloudflare Worker in
 * `workers/rsvp-cron` (`/api/cron/rsvp` is rewritten here for workers that
 * haven't been redeployed yet). Runs every hourly job with allSettled so one
 * failing doesn't skip the other, reports each, and returns 500 if any
 * failed. Requires `Authorization: Bearer <CRON_SECRET>`.
 */
async function handle(request: Request): Promise<Response> {
  return handleCronRequest(request, {
    logLabel: 'cron/hourly',
    failureBody: fail('Scheduled hourly run failed.'),
    run: async () => {
      const [rsvp, campaigns] = await Promise.allSettled([Rsvp.runRsvpCron(), Campaigns.dispatchDueCampaigns()]);
      const report = {
        rsvp: settledReport(rsvp),
        campaigns: settledReport(campaigns),
      };
      console.info('[cron/hourly] completed', report);
      if (rsvp.status === 'rejected' || campaigns.status === 'rejected') {
        throw new AggregateError(
          [rsvp, campaigns].filter((step) => step.status === 'rejected').map((step) => step.reason),
          'Scheduled hourly run failed.',
        );
      }
      return { rsvp: rsvp.value, campaigns: campaigns.value };
    },
  });
}

function settledReport<T>(result: PromiseSettledResult<T>) {
  return result.status === 'fulfilled' ? { ok: true, result: result.value } : { ok: false };
}

export const GET = handle;
export const POST = handle;
