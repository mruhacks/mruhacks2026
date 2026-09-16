/**
 * Better Auth's magic-link plugin only accepts `expiresIn` as a duration
 * (seconds), not an absolute timestamp. RSVP invitations derive that duration
 * from remaining time until the wave `respondBy` so the login token cannot
 * outlive — or fall short of — the RSVP opportunity.
 *
 * Sign-in / invite links keep using the plugin default (24h) when no RSVP
 * mail context is set.
 */
export function remainingMagicLinkExpiresInSeconds(
  respondBy: Date,
  now: Date = new Date(),
): number {
  const remainingMs = respondBy.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return 0;
  }
  return Math.ceil(remainingMs / 1000);
}
