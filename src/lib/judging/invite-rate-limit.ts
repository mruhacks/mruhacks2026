import 'server-only';

import { RateLimiterMemory } from 'rate-limiter-flexible';

/**
 * Bounds how often one organizer can trigger judge invite emails by hand
 * (Resend, Send outstanding invites). The public sign-in form gets Better
 * Auth's per-IP limit, but that only runs on HTTP requests to its router,
 * never on the server-side `signInMagicLink` call these go through.
 *
 * Each address is separately held to the shared 60s sign-in-link cooldown
 * (`claimMagicLinkCooldown`); this is the per-sender cap on top. Adding a
 * judge isn't counted: it can email each address on the roster only once.
 *
 * In-memory like the wallet limiter, so per server instance only — the
 * callers are authenticated and permission-checked organizers, so this is
 * about blunting a stuck button or retry loop, not a hard security boundary.
 */
const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

/** Returns false when `userId` has sent too many invites by hand lately. */
export async function checkJudgeInviteRateLimit(
  userId: string,
): Promise<boolean> {
  try {
    await limiter.consume(userId);
    return true;
  } catch {
    return false;
  }
}

export const JUDGE_INVITE_RATE_LIMITED =
  'You’ve sent a lot of invites in the last minute. Wait a moment and try again.';
