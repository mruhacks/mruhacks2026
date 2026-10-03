/**
 * When the scheduler will send the next RSVP wave on its own. Pure, so the
 * admin RSVP page can show an estimate without asking the server.
 *
 * The scheduler (`runScheduledRsvpWaves`) runs hourly on the hour — see the
 * `crons` entry in `workers/rsvp-cron/wrangler.json`; keep the two in step.
 * It never sends a first wave, and sends a follow-up only once the latest wave
 * has closed (`respond_by <= now`), so the next automatic wave goes out at the
 * first hourly run at or after the later of `respond_by` and now.
 */

const RSVP_CRON_INTERVAL_MS = 60 * 60 * 1000;

/** First scheduler run at or after `instant` (top of an hour, UTC). */
export function nextRsvpCronRunAt(instant: Date): Date {
  const ms = instant.getTime();
  return new Date(
    Math.ceil(ms / RSVP_CRON_INTERVAL_MS) * RSVP_CRON_INTERVAL_MS,
  );
}

/**
 * Approximate time the next wave sends automatically, or null when the
 * scheduler won't send one (no wave has been sent yet — the first is always
 * manual). Whether anyone is left to invite, and whether a spot is open, are
 * the caller's to check: the scheduler skips the run otherwise.
 */
export function estimateAutoWaveAt(
  latestWaveRespondBy: Date | null,
  now: Date,
): Date | null {
  if (!latestWaveRespondBy) return null;
  const earliest =
    latestWaveRespondBy.getTime() > now.getTime() ? latestWaveRespondBy : now;
  return nextRsvpCronRunAt(earliest);
}
