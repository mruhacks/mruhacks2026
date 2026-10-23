/** Campaign enums, shared by the schema, the server and the editor UI. */

export const CAMPAIGN_TYPES = ['marketing', 'operational'] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_DELIVERY_STATUSES = ['queued', 'sent', 'failed', 'skipped'] as const;
export type CampaignDeliveryStatus = (typeof CAMPAIGN_DELIVERY_STATUSES)[number];
