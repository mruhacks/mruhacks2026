import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  campaigns,
  events,
  user,
  type CampaignStatus,
  type CampaignType,
} from '@/db/schema';
import { db } from '@/utils/db';

export type CampaignListRow = {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  eventName: string | null;
  scheduledFor: Date | null;
  sentAt: Date | null;
  updatedAt: Date;
  updatedByName: string | null;
};

const editor = alias(user, 'campaign_editor');

/** Every campaign, most recently edited first. Ownership is shared, so there's no per-user filter. */
export async function listCampaigns(): Promise<CampaignListRow[]> {
  return db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      type: campaigns.type,
      status: campaigns.status,
      eventName: events.name,
      scheduledFor: campaigns.scheduledFor,
      sentAt: campaigns.sentAt,
      updatedAt: campaigns.updatedAt,
      updatedByName: editor.name,
    })
    .from(campaigns)
    .leftJoin(events, eq(campaigns.eventId, events.id))
    .leftJoin(editor, eq(campaigns.updatedBy, editor.id))
    .orderBy(desc(campaigns.updatedAt));
}
