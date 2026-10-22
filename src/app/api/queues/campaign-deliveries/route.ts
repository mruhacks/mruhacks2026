import { handleCallback } from '@vercel/queue';

import * as Campaigns from '@/lib/campaigns/server';

export const POST = handleCallback<Campaigns.CampaignDeliveryMessage>(
  async ({ deliveryId }) => {
    await Campaigns.processCampaignDelivery(deliveryId);
  },
  {
    // Backoff timing only: processCampaignDelivery has already decided to
    // give up (returned normally) or retry (threw) before this runs.
    retry: (_error, metadata) => ({
      afterSeconds: Campaigns.campaignDeliveryRetryDelay(metadata.deliveryCount),
    }),
  },
);
