import { handleCallback } from '@vercel/queue';

import * as Rsvp from '@/lib/rsvp/server';

export const POST = handleCallback<Rsvp.RsvpInvitationMessage>(
  async ({ responseId }, metadata) => {
    await Rsvp.processRsvpInvitation(responseId, metadata.deliveryCount);
  },
  {
    // Backoff timing only: processRsvpInvitation already decided to give up
    // (returned normally) or retry (threw) before the retry callback runs.
    retry: (_error, metadata) => ({
      afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5),
    }),
  },
);
