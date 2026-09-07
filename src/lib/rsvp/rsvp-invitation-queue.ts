import 'server-only';

import { send } from '@vercel/queue';

/** Vercel Queue topic for RSVP invitation emails, one message per response row. */
export const RSVP_INVITATION_QUEUE_TOPIC = 'rsvp-invitations';

/** Message payload published to {@link RSVP_INVITATION_QUEUE_TOPIC}. */
export type RsvpInvitationMessage = {
  responseId: string;
};

/** Total publish attempts before giving up on this call (not Vercel's consumer retries). */
const MAX_PUBLISH_ATTEMPTS = 3;
/** Backoff before each retry, ms — one entry per retry (not the first attempt). */
const PUBLISH_RETRY_DELAYS_MS = [250, 500];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Publishes a queue message for a single RSVP invitation, retrying a few
 * times immediately if the publish call itself fails. This only covers the
 * publish call — once a message is accepted by Vercel Queue, Vercel owns
 * consumer delivery retries.
 *
 * Idempotency key is the response row's id on every attempt, so a retry
 * after a publish that actually succeeded server-side (but whose response
 * this call didn't receive) does not create a duplicate message.
 */
export async function publishRsvpInvitation(
  responseId: string,
): Promise<{ messageId: string | null }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
    try {
      return await send<RsvpInvitationMessage>(
        RSVP_INVITATION_QUEUE_TOPIC,
        { responseId },
        { idempotencyKey: responseId },
      );
    } catch (error) {
      lastError = error;
      const delayMs = PUBLISH_RETRY_DELAYS_MS[attempt - 1];
      if (delayMs === undefined) break;
      console.warn(
        '[publishRsvpInvitation] publish attempt failed, retrying',
        { responseId, attempt, error },
      );
      await wait(delayMs);
    }
  }

  throw lastError;
}
