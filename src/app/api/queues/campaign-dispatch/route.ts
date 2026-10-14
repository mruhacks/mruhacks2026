import { handleCallback } from '@vercel/queue';

import type { CampaignDispatchMessage } from '@/lib/campaigns/campaign-queue';
import { processCampaignDispatch } from '@/lib/campaigns/process-dispatch';

export const POST = handleCallback<CampaignDispatchMessage>(
  async ({ campaignId }) => {
    const outcome = await processCampaignDispatch(campaignId);
    console.info('[campaigns/dispatch] processed', { campaignId, outcome });
  },
  {
    retry: (_error, metadata) => ({
      afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5),
    }),
  },
);
