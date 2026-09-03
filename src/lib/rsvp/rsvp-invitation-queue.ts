import 'server-only';

import { send } from '@vercel/queue';

/** Vercel Queue topic for RSVP invitation emails, one message per response row. */
export const RSVP_INVITATION_QUEUE_TOPIC = 'rsvp-invitations';

/** Message payload published to {@link RSVP_INVITATION_QUEUE_TOPIC}. */
export type RsvpInvitationMessage = {
  responseId: string;
};

/**
 * Publishes a queue message for a single RSVP invitation. Idempotency key
 * is the response row's id, so redundant publishes are deduplicated.
 */
export async function publishRsvpInvitation(
  responseId: string,
): Promise<{ messageId: string | null }> {
  return send<RsvpInvitationMessage>(
    RSVP_INVITATION_QUEUE_TOPIC,
    { responseId },
    { idempotencyKey: responseId },
  );
}
