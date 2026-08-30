import 'server-only';

import { RateLimiterMemory } from 'rate-limiter-flexible';

/**
 * Each wallet request does real work before this check even runs (a DB
 * join) and, on success, expensive work after it (Ed25519 signing, zip
 * generation for the Apple pass, a round-trip to the Google Wallet API) —
 * so this bounds how often one signed-in user can trigger that, shared
 * across the Apple pass, standalone QR, and Google Wallet routes since
 * they all do comparable-cost work for the same participant.
 *
 * In-memory, so this only limits per server instance, not globally across
 * a multi-instance deployment — acceptable here since the goal is blunting
 * accidental hammering (a refreshed tab, a retry loop), not a hard security
 * boundary; the routes are already authenticated and authorized.
 */
const limiter = new RateLimiterMemory({ points: 10, duration: 60 });

/** Returns false when `userId` has exceeded the wallet endpoint rate limit. */
export async function checkWalletRateLimit(userId: string): Promise<boolean> {
  try {
    await limiter.consume(userId);
    return true;
  } catch {
    return false;
  }
}
