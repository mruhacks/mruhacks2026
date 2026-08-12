import { runScheduledRsvpWaves } from '@/lib/rsvp/run-scheduled-rsvp-waves';

/**
 * Cron entrypoint for follow-up RSVP waves. Requires
 * `Authorization: Bearer <CRON_SECRET>`. Schedule: `vercel.json` (UTC midnight).
 */
function authorizeCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error('[cron/rsvp-waves] CRON_SECRET is not configured');
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
    const result = await runScheduledRsvpWaves();
    console.info('[cron/rsvp-waves] completed', {
      timedOutCount: result.timedOutCount,
      eventsConsidered: result.eventsConsidered,
      wavesSent: result.wavesSent,
    });
    return Response.json(result);
  } catch (error) {
    console.error('[cron/rsvp-waves] failed', error);
    return Response.json(
      { error: 'Scheduled RSVP wave run failed.' },
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
