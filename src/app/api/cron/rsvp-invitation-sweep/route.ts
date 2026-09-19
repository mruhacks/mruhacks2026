import { fail } from '@/utils/action-result';
import { requeuePendingRsvpInvitations } from '@/lib/rsvp/requeue-pending-rsvp-invitations';
import { handleCronRequest } from '@/app/api/cron/handle-cron-request';

/**
 * Cron entrypoint for the RSVP invitation reconciliation sweep. Requires
 * `Authorization: Bearer <CRON_SECRET>` or, optionally,
 * `Authorization: Bearer <CRON_MANUAL_SECRET>`. Schedule: `vercel.json`.
 */
async function handle(request: Request): Promise<Response> {
  return handleCronRequest(request, {
    logLabel: '[cron/rsvp-invitation-sweep]',
    extraSecrets: [process.env.CRON_MANUAL_SECRET?.trim()].filter(
      (value): value is string => Boolean(value),
    ),
    failureBody: fail('RSVP invitation reconciliation sweep failed.'),
    run: async () => {
      const result = await requeuePendingRsvpInvitations();
      console.info('[cron/rsvp-invitation-sweep] completed', result);
      return result;
    },
  });
}

export const GET = handle;
export const POST = handle;
