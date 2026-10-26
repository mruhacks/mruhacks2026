import 'server-only';

import { asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import * as schema from '@/db/schema';
import { db } from '@/utils/db';
import type { AudienceRuleGroup } from './audience-rules';

export type SavedAudienceRow = {
  id: string;
  name: string;
  rules: AudienceRuleGroup;
  updatedAt: Date;
  updatedByName: string | null;
  /** Campaigns that link to it, in any status. */
  usedBy: number;
  /** Of those, how many are scheduled — editing changes who they'll reach. */
  scheduled: number;
};

const editor = alias(schema.user, 'audience_editor');

function usageColumns() {
  return {
    usedBy: sql<number>`(
      SELECT count(*) FROM ${schema.campaigns}
       WHERE ${schema.campaigns.savedAudienceId} = ${schema.savedAudiences.id}
    )`.mapWith(Number),
    scheduled: sql<number>`(
      SELECT count(*) FROM ${schema.campaigns}
       WHERE ${schema.campaigns.savedAudienceId} = ${schema.savedAudiences.id}
         AND ${schema.campaigns.status} = 'scheduled'
    )`.mapWith(Number),
  };
}

export async function listSavedAudiences(): Promise<SavedAudienceRow[]> {
  return db
    .select({
      id: schema.savedAudiences.id,
      name: schema.savedAudiences.name,
      rules: schema.savedAudiences.rules,
      updatedAt: schema.savedAudiences.updatedAt,
      updatedByName: editor.name,
      ...usageColumns(),
    })
    .from(schema.savedAudiences)
    .leftJoin(editor, eq(schema.savedAudiences.updatedBy, editor.id))
    .orderBy(asc(schema.savedAudiences.name));
}

export async function getSavedAudience(id: string): Promise<SavedAudienceRow | null> {
  const [row] = await db
    .select({
      id: schema.savedAudiences.id,
      name: schema.savedAudiences.name,
      rules: schema.savedAudiences.rules,
      updatedAt: schema.savedAudiences.updatedAt,
      updatedByName: editor.name,
      ...usageColumns(),
    })
    .from(schema.savedAudiences)
    .leftJoin(editor, eq(schema.savedAudiences.updatedBy, editor.id))
    .where(eq(schema.savedAudiences.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * The rules a campaign uses right now: its linked saved audience's current
 * rules, or its own inline ones. This is what gets copied to
 * `audience_snapshot` when a send starts.
 */
export async function currentCampaignRules(campaign: {
  audienceRules: AudienceRuleGroup | null;
  savedAudienceId: string | null;
}): Promise<AudienceRuleGroup | null> {
  if (!campaign.savedAudienceId) return campaign.audienceRules;
  const [row] = await db
    .select({ rules: schema.savedAudiences.rules })
    .from(schema.savedAudiences)
    .where(eq(schema.savedAudiences.id, campaign.savedAudienceId))
    .limit(1);
  return row?.rules ?? null;
}
