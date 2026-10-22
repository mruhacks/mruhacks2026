import 'server-only';

import { asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { campaigns, savedAudiences, user } from '@/db/schema';
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

const editor = alias(user, 'audience_editor');

function usageColumns() {
  return {
    usedBy: sql<number>`(
      SELECT count(*) FROM ${campaigns}
       WHERE ${campaigns.savedAudienceId} = ${savedAudiences.id}
    )`.mapWith(Number),
    scheduled: sql<number>`(
      SELECT count(*) FROM ${campaigns}
       WHERE ${campaigns.savedAudienceId} = ${savedAudiences.id}
         AND ${campaigns.status} = 'scheduled'
    )`.mapWith(Number),
  };
}

export async function listSavedAudiences(): Promise<SavedAudienceRow[]> {
  return db
    .select({
      id: savedAudiences.id,
      name: savedAudiences.name,
      rules: savedAudiences.rules,
      updatedAt: savedAudiences.updatedAt,
      updatedByName: editor.name,
      ...usageColumns(),
    })
    .from(savedAudiences)
    .leftJoin(editor, eq(savedAudiences.updatedBy, editor.id))
    .orderBy(asc(savedAudiences.name));
}

export async function getSavedAudience(id: string): Promise<SavedAudienceRow | null> {
  const [row] = await db
    .select({
      id: savedAudiences.id,
      name: savedAudiences.name,
      rules: savedAudiences.rules,
      updatedAt: savedAudiences.updatedAt,
      updatedByName: editor.name,
      ...usageColumns(),
    })
    .from(savedAudiences)
    .leftJoin(editor, eq(savedAudiences.updatedBy, editor.id))
    .where(eq(savedAudiences.id, id))
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
    .select({ rules: savedAudiences.rules })
    .from(savedAudiences)
    .where(eq(savedAudiences.id, campaign.savedAudienceId))
    .limit(1);
  return row?.rules ?? null;
}
