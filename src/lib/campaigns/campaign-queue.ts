import 'server-only';

import { send } from '@vercel/queue';

/**
 * Two-stage campaign fan-out on Vercel Queues, modelled on the RSVP
 * invitation queue (`@/lib/rsvp/rsvp-invitation-queue`):
 *
 *   campaign-dispatch    one message per send: claims the campaign, works out
 *                        the audience, writes a delivery row per recipient
 *   campaign-deliveries  one message per delivery row: renders and sends one
 *                        email, paced with `delaySeconds`
 */
const CAMPAIGN_DISPATCH_TOPIC = 'campaign-dispatch';
const CAMPAIGN_DELIVERY_TOPIC = 'campaign-deliveries';

export type CampaignDispatchMessage = {
  campaignId: string;
  scheduledFor: string;
};
export type CampaignDeliveryMessage = { deliveryId: string };

/**
 * About 10 emails a second. SES allows 14/s on this account; the gap leaves
 * room for sign-in and RSVP email sent while a campaign goes out.
 */
const DELIVERIES_PER_SECOND = 10;

/** Delay for the `index`-th delivery of a dispatch: `floor(i / 10)` seconds. */
export function deliveryDelaySeconds(index: number): number {
  return Math.floor(index / DELIVERIES_PER_SECOND);
}

/** Total publish attempts before giving up on this call (not Vercel's consumer retries). */
const MAX_PUBLISH_ATTEMPTS = 3;
/** Backoff before each retry, ms — one entry per retry (not the first attempt). */
const PUBLISH_RETRY_DELAYS_MS = [250, 500];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Publishes with a few immediate retries if the publish call itself fails.
 * The idempotency key is stable across those retries, so a publish that
 * landed but whose response was lost doesn't create a duplicate message.
 */
async function publish<T>(
  topic: string,
  payload: T,
  options: { idempotencyKey: string; delaySeconds?: number },
): Promise<{ messageId: string | null }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
    try {
      return await send<T>(topic, payload, options);
    } catch (error) {
      lastError = error;
      const delayMs = PUBLISH_RETRY_DELAYS_MS[attempt - 1];
      if (delayMs === undefined) break;
      console.warn('[campaigns/queue] publish attempt failed, retrying', {
        topic,
        idempotencyKey: options.idempotencyKey,
        attempt,
        error,
      });
      await wait(delayMs);
    }
  }
  throw lastError;
}

/**
 * Queues a campaign's dispatch. Keyed by the campaign and when it was
 * scheduled for, so a duplicate for the same send collapses but sending
 * again after an unschedule doesn't.
 */
export function publishCampaignDispatch(
  campaignId: string,
  scheduledFor: Date,
) {
  return publish<CampaignDispatchMessage>(
    CAMPAIGN_DISPATCH_TOPIC,
    { campaignId, scheduledFor: scheduledFor.toISOString() },
    { idempotencyKey: `${campaignId}:${scheduledFor.toISOString()}` },
  );
}

/**
 * Queues one delivery. `round` is how many times it's been (re)queued —
 * "Retry failed" bumps it — so a retry isn't swallowed as a duplicate of
 * the original publish.
 */
export function publishCampaignDelivery(
  deliveryId: string,
  options: { delaySeconds: number; round: number },
) {
  return publish<CampaignDeliveryMessage>(
    CAMPAIGN_DELIVERY_TOPIC,
    { deliveryId },
    {
      idempotencyKey: `${deliveryId}:${options.round}`,
      delaySeconds: options.delaySeconds,
    },
  );
}
