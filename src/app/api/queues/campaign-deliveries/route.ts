import { handleCallback } from '@vercel/queue';

import type { CampaignDeliveryMessage } from '@/lib/campaigns/campaign-queue';
import {
  campaignDeliveryRetryDelay,
  processCampaignDelivery,
} from '@/lib/campaigns/process-delivery';

export const POST = handleCallback<CampaignDeliveryMessage>(
  async ({ deliveryId }) => {
    await processCampaignDelivery(deliveryId);
  },
  {
    // Backoff timing only: processCampaignDelivery has already decided to
    // give up (returned normally) or retry (threw) before this runs.
    retry: (_error, metadata) => ({
      afterSeconds: campaignDeliveryRetryDelay(metadata.deliveryCount),
    }),
  },
);
