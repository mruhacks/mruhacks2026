import 'server-only';

import { asc, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import * as schema from '@/db/schema';
import { db } from '@/utils/db';
import type { AudienceOptions } from './audience-options';

export type ListRow = {
  id: string;
  name: string;
  type: schema.CampaignType;
  status: schema.CampaignStatus;
  eventName: string | null;
  scheduledFor: Date | null;
  sentAt: Date | null;
  updatedAt: Date;
  updatedByName: string | null;
};

const editor = alias(schema.user, 'campaign_editor');

/** Every campaign, most recently edited first. Ownership is shared, so there's no per-user filter. */
export async function listCampaigns(): Promise<ListRow[]> {
  return db
    .select({
      id: schema.campaigns.id,
      name: schema.campaigns.name,
      type: schema.campaigns.type,
      status: schema.campaigns.status,
      eventName: schema.events.name,
      scheduledFor: schema.campaigns.scheduledFor,
      sentAt: schema.campaigns.sentAt,
      updatedAt: schema.campaigns.updatedAt,
      updatedByName: editor.name,
    })
    .from(schema.campaigns)
    .leftJoin(schema.events, eq(schema.campaigns.eventId, schema.events.id))
    .leftJoin(editor, eq(schema.campaigns.updatedBy, editor.id))
    .orderBy(desc(schema.campaigns.updatedAt));
}

export type Detail = typeof schema.campaigns.$inferSelect & {
  eventName: string | null;
  /** The event allows a wallet block: top-level (always, for a campaign event) with check-in on. */
  walletAllowed: boolean;
  updatedByName: string | null;
};

export async function getCampaign(id: string): Promise<Detail | null> {
  const [row] = await db
    .select({
      campaign: schema.campaigns,
      eventName: schema.events.name,
      eventCheckInEnabled: schema.events.checkInEnabled,
      eventParentId: schema.events.parentEventId,
      updatedByName: editor.name,
    })
    .from(schema.campaigns)
    .leftJoin(schema.events, eq(schema.campaigns.eventId, schema.events.id))
    .leftJoin(editor, eq(schema.campaigns.updatedBy, editor.id))
    .where(eq(schema.campaigns.id, id))
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
        id: schema.events.id,
        name: schema.events.name,
        parentEventId: schema.events.parentEventId,
        startsAt: schema.events.startsAt,
        checkInEnabled: schema.events.checkInEnabled,
      })
      .from(schema.events)
      .orderBy(desc(schema.events.startsAt), asc(schema.events.name)),
    db
      .select({ id: schema.role.id, slug: schema.role.slug, description: schema.role.description })
      .from(schema.role)
      .orderBy(asc(schema.role.slug)),
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
