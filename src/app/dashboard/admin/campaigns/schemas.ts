import { z } from 'zod';

import { CAMPAIGN_TYPES } from '@/lib/campaigns/constants';
import { audienceRulesSchema } from '@/lib/campaigns/audience-rules';

export const campaignTypeSchema = z.enum(CAMPAIGN_TYPES);

/** Where an audience is evaluated: a campaign type and, for operational, its event. */
export const audienceContextSchema = z
  .object({
    type: campaignTypeSchema,
    eventId: z.uuid().nullable(),
  })
  .refine((value) => value.type !== 'operational' || value.eventId, {
    message: 'Operational email needs an event.',
    path: ['eventId'],
  });

export const audienceQuerySchema = z.object({
  context: audienceContextSchema,
  rules: audienceRulesSchema,
});
export type AudienceQueryInput = z.input<typeof audienceQuerySchema>;

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the campaign a name.').max(200),
    type: campaignTypeSchema,
    eventId: z.uuid().nullable(),
  })
  .refine((value) => value.type !== 'operational' || value.eventId, {
    message: 'Operational email needs an event.',
    path: ['eventId'],
  });
export type CreateCampaignInput = z.input<typeof createCampaignSchema>;
