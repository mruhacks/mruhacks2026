import { requeuePendingRsvpInvitations } from '@/lib/rsvp/requeue-pending-rsvp-invitations';

/**
 * Cron entrypoint for the RSVP invitation reconciliation sweep. Requires
 * `Authorization: Bearer <CRON_SECRET>`. Schedule: `vercel.json`.
 */
function authorizeCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error('[cron/rsvp-invitation-sweep] CRON_SECRET is not configured');
    return false;
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) return false;

  const [scheme, token] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token === secret;
}

async function handleCron(request: Request): Promise<Response> {
  if (!authorizeCronRequest(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await requeuePendingRsvpInvitations();
    console.info('[cron/rsvp-invitation-sweep] completed', result);
    return Response.json(result);
  } catch (error) {
    console.error('[cron/rsvp-invitation-sweep] failed', error);
    return Response.json(
      { error: 'RSVP invitation reconciliation sweep failed.' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleCron(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleCron(request);
}
