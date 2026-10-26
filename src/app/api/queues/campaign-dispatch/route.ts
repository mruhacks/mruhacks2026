import { handleCallback } from '@vercel/queue';

import * as Campaigns from '@/lib/campaigns/server';

export const POST = handleCallback<Campaigns.DispatchMessage>(
  async ({ campaignId, scheduledFor }) => {
    const outcome = await Campaigns.processCampaignDispatch(campaignId, scheduledFor);
    console.info('[campaigns/dispatch] processed', { campaignId, outcome });
  },
  {
    retry: (_error, metadata) => ({
      afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5),
    }),
  },
);
