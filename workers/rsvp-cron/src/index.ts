/**
 * Hourly scheduler for the app's `/api/cron/rsvp` route (follow-up RSVP waves
 * + invitation requeue sweep). Vercel Hobby only allows daily crons, so a
 * Cloudflare Cron Trigger (`triggers.crons` in `wrangler.json`) drives it.
 */
interface Env {
  /** Production origin of the Next app, e.g. `https://mruhacks.ca`. */
  APP_URL: string;
  /** Same value as the app's CRON_SECRET (`wrangler secret put`). */
  CRON_SECRET: string;
}

const RSVP_CRON_PATH = '/api/cron/rsvp';

export default {
  async scheduled(_controller, env) {
    const url = new URL(RSVP_CRON_PATH, env.APP_URL);
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
    const body = await response.text();

    if (!response.ok) {
      // Throwing marks this Cron Event as failed in the Cloudflare dashboard.
      throw new Error(`${url.pathname} responded ${response.status}: ${body}`);
    }

    console.log(`${url.pathname} ok`, body);
  },
} satisfies ExportedHandler<Env>;
