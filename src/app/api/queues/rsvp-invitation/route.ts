import { handleCallback } from '@vercel/queue';

import { processRsvpInvitation } from '@/lib/rsvp/process-rsvp-invitation';
import type { RsvpInvitationMessage } from '@/lib/rsvp/rsvp-invitation-queue';

export const POST = handleCallback<RsvpInvitationMessage>(
  async ({ responseId }, metadata) => {
    await processRsvpInvitation(responseId, metadata.deliveryCount);
  },
  {
    // Backoff timing only: processRsvpInvitation already decided to give up
    // (returned normally) or retry (threw) before the retry callback runs.
    retry: (_error, metadata) => ({
      afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5),
    }),
  },
);
