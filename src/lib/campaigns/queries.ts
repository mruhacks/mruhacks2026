import 'server-only';

import { asc, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { campaigns, events, role, user, type CampaignStatus, type CampaignType } from '@/db/schema';
import { db } from '@/utils/db';
import type { AudienceOptions } from './audience-options';

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

export type CampaignDetail = typeof campaigns.$inferSelect & {
  eventName: string | null;
  /** The event allows a wallet block: top-level (always, for a campaign event) with check-in on. */
  walletAllowed: boolean;
  updatedByName: string | null;
};

export async function getCampaign(id: string): Promise<CampaignDetail | null> {
  const [row] = await db
    .select({
      campaign: campaigns,
      eventName: events.name,
      eventCheckInEnabled: events.checkInEnabled,
      eventParentId: events.parentEventId,
      updatedByName: editor.name,
    })
    .from(campaigns)
    .leftJoin(events, eq(campaigns.eventId, events.id))
    .leftJoin(editor, eq(campaigns.updatedBy, editor.id))
    .where(eq(campaigns.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...row.campaign,
    eventName: row.eventName,
    walletAllowed: Boolean(row.campaign.eventId && row.eventCheckInEnabled && !row.eventParentId),
    updatedByName: row.updatedByName,
  };
}

/** Events and roles the audience builder's pickers offer. */
export async function getAudienceOptions(): Promise<AudienceOptions> {
  const [eventRows, roleRows] = await Promise.all([
    db
      .select({
        id: events.id,
        name: events.name,
        parentEventId: events.parentEventId,
        startsAt: events.startsAt,
        checkInEnabled: events.checkInEnabled,
      })
      .from(events)
      .orderBy(desc(events.startsAt), asc(events.name)),
    db.select({ id: role.id, slug: role.slug, description: role.description }).from(role).orderBy(asc(role.slug)),
  ]);

  const topLevel = eventRows.filter((row) => !row.parentEventId);
  return {
    events: topLevel.map((event) => ({
      id: event.id,
      name: event.name,
      checkInEnabled: event.checkInEnabled,
      subevents: eventRows
        .filter((row) => row.parentEventId === event.id)
        .map((row) => ({ id: row.id, name: row.name })),
    })),
    roles: roleRows.map((row) => ({
      id: row.id,
      name: row.slug ?? `Role ${row.id}`,
    })),
  };
}
