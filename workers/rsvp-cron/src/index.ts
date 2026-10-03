/**
 * Hourly scheduler for the app's `/api/cron/rsvp` route (follow-up RSVP waves
 * + invitation requeue sweep). Vercel Hobby only allows daily crons, so a
 * Cloudflare Cron Trigger (`triggers.crons` in `wrangler.json`) drives it.
 */
interface Env {
  /**
   * Comma-separated origins of every deployment to trigger, e.g.
   * `https://mruhacks.ca,https://test.mruhacks.ca`.
   */
  APP_URLS: string;
  /** Same value as each app's CRON_SECRET (`wrangler secret put`). */
  CRON_SECRET: string;
}

const RSVP_CRON_PATH = '/api/cron/rsvp';

async function triggerRsvpCron(origin: string, secret: string) {
  const url = new URL(RSVP_CRON_PATH, origin);
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${url.href} responded ${response.status}: ${body}`);
  }

  console.log(`${url.href} ok`, body);
}

export default {
  async scheduled(_controller, env) {
    const origins = env.APP_URLS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (origins.length === 0) throw new Error('APP_URLS is empty');

    // Fire every deployment in parallel so one slow or failing origin doesn't
    // delay or skip the others.
    const results = await Promise.allSettled(
      origins.map((origin) => triggerRsvpCron(origin, env.CRON_SECRET)),
    );
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );

    if (failures.length > 0) {
      // Throwing marks this Cron Event as failed in the Cloudflare dashboard.
      throw new AggregateError(
        failures,
        `${failures.length}/${origins.length} deployments failed: ${failures
          .map((error) => (error instanceof Error ? error.message : String(error)))
          .join('; ')}`,
      );
    }
  },
} satisfies ExportedHandler<Env>;
