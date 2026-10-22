/**
 * Server actions for saved audiences and linking them to campaigns. All of
 * it is `campaign:write:all`: a saved audience is a campaign drafting tool.
 *
 * A campaign has either inline rules or a linked saved audience, never both
 * (enforced by a check constraint too). Linked means it always uses the
 * audience's current rules; "Detach" copies them into the campaign, and
 * "Save as audience" goes the other way. The linking actions refresh the
 * client router, since the campaign page renders from server data.
 */

'use server';

import { and, count, eq } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { z } from 'zod';

import * as schema from '@/db/schema';
import * as Campaigns from '@/lib/campaigns';
import * as Rbac from '@/lib/rbac/server';
import { fail, ok, type ActionResult } from '@/utils/action-result';
import { writeAuditLog } from '@/utils/audit-log';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { serverActionError } from '@/utils/server-action-error';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Give the audience a name.')
  .max(200, 'Keep the name under 200 characters.');
const idSchema = z.uuid();

async function requireWriter() {
  const user = await getUser();
  if (!user) return null;
  await Rbac.requirePermission(user.id, 'campaign:write:all');
  return user;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

// ── Saved audience CRUD ────────────────────────────────────────────────────

export async function createSavedAudience(input: {
  name: string;
  rules?: Campaigns.AudienceRuleGroup;
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireWriter();
  if (!user) return fail('Not authenticated');

  const name = nameSchema.safeParse(input.name);
  if (!name.success) return fail(firstIssue(name.error));
  const rules = Campaigns.audienceRulesSchema.safeParse(input.rules ?? Campaigns.emptyAudience());
  if (!rules.success) return fail(firstIssue(rules.error));

  try {
    const [row] = await db
      .insert(schema.savedAudiences)
      .values({
        name: name.data,
        rules: rules.data,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning({ id: schema.savedAudiences.id });
    await writeAuditLog({
      actorId: user.id,
      action: 'saved_audience.create',
      targetType: 'saved_audience',
      targetId: row.id,
      metadata: { name: name.data },
    });
    return ok({ id: row.id });
  } catch (error) {
    return serverActionError('create audience', error);
  }
}

/**
 * Renames and/or replaces a saved audience's rules. Every campaign linking to
 * it picks the change up — including scheduled ones, which is why the editor
 * shows how many there are.
 */
export async function updateSavedAudience(
  audienceId: string,
  input: { name: string; rules: Campaigns.AudienceRuleGroup },
): Promise<ActionResult> {
  const user = await requireWriter();
  if (!user) return fail('Not authenticated');
  if (!idSchema.safeParse(audienceId).success) return fail('Audience not found');

  const name = nameSchema.safeParse(input.name);
  if (!name.success) return fail(firstIssue(name.error));
  const rules = Campaigns.audienceRulesSchema.safeParse(input.rules);
  if (!rules.success) return fail(firstIssue(rules.error));

  try {
    const updated = await db
      .update(schema.savedAudiences)
      .set({ name: name.data, rules: rules.data, updatedBy: user.id })
      .where(eq(schema.savedAudiences.id, audienceId))
      .returning({ id: schema.savedAudiences.id });
    if (updated.length === 0) return fail('Audience not found');
    await writeAuditLog({
      actorId: user.id,
      action: 'saved_audience.update',
      targetType: 'saved_audience',
      targetId: audienceId,
      metadata: { name: name.data, rules: rules.data },
    });
    return ok();
  } catch (error) {
    return serverActionError('save audience', error);
  }
}

/** Refused while any campaign still links to it — detach those first. */
export async function deleteSavedAudience(audienceId: string): Promise<ActionResult> {
  const user = await requireWriter();
  if (!user) return fail('Not authenticated');
  if (!idSchema.safeParse(audienceId).success) return fail('Audience not found');

  const [usage] = await db
    .select({ c: count() })
    .from(schema.campaigns)
    .where(eq(schema.campaigns.savedAudienceId, audienceId));
  const usedBy = Number(usage?.c ?? 0);
  if (usedBy > 0) {
    return fail(
      `${usedBy} ${usedBy === 1 ? 'campaign uses' : 'campaigns use'} this audience. Detach ${usedBy === 1 ? 'it' : 'them'} before deleting.`,
    );
  }

  try {
    const deleted = await db
      .delete(schema.savedAudiences)
      .where(eq(schema.savedAudiences.id, audienceId))
      .returning({ name: schema.savedAudiences.name });
    if (deleted.length === 0) return fail('Audience not found');
    await writeAuditLog({
      actorId: user.id,
      action: 'saved_audience.delete',
      targetType: 'saved_audience',
      targetId: audienceId,
      metadata: { name: deleted[0].name },
    });
    return ok();
  } catch (error) {
    // The FK is `restrict`: a campaign linked in between the check above and
    // this delete still can't be orphaned.
    return serverActionError('delete audience', error);
  }
}

// ── Linking campaigns ──────────────────────────────────────────────────────

async function loadDraft(campaignId: string) {
  if (!idSchema.safeParse(campaignId).success) return null;
  const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId)).limit(1);
  return row ?? null;
}

const NOT_DRAFT = 'Only drafts can be edited. Unschedule it first.';

/** Points a draft at a saved audience, dropping its inline rules. */
export async function linkCampaignAudience(campaignId: string, audienceId: string): Promise<ActionResult> {
  const user = await requireWriter();
  if (!user) return fail('Not authenticated');
  const campaign = await loadDraft(campaignId);
  if (!campaign) return fail('Campaign not found');
  if (campaign.status !== 'draft') return fail(NOT_DRAFT);
  if (!idSchema.safeParse(audienceId).success) return fail('Audience not found');

  try {
    const [audience] = await db
      .select({ id: schema.savedAudiences.id })
      .from(schema.savedAudiences)
      .where(eq(schema.savedAudiences.id, audienceId))
      .limit(1);
    if (!audience) return fail('Audience not found');
    await db
      .update(schema.campaigns)
      .set({
        savedAudienceId: audienceId,
        audienceRules: null,
        updatedBy: user.id,
      })
      .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.status, 'draft')));
    refresh();
    return ok();
  } catch (error) {
    return serverActionError('link audience', error);
  }
}

/** Copies the linked audience's current rules into the campaign and unlinks it. */
export async function detachCampaignAudience(campaignId: string): Promise<ActionResult> {
  const user = await requireWriter();
  if (!user) return fail('Not authenticated');
  const campaign = await loadDraft(campaignId);
  if (!campaign) return fail('Campaign not found');
  if (campaign.status !== 'draft') return fail(NOT_DRAFT);
  if (!campaign.savedAudienceId) return ok();

  try {
    const [audience] = await db
      .select({ rules: schema.savedAudiences.rules })
      .from(schema.savedAudiences)
      .where(eq(schema.savedAudiences.id, campaign.savedAudienceId))
      .limit(1);
    await db
      .update(schema.campaigns)
      .set({
        savedAudienceId: null,
        audienceRules: audience?.rules ?? Campaigns.emptyAudience(),
        updatedBy: user.id,
      })
      .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.status, 'draft')));
    refresh();
    return ok();
  } catch (error) {
    return serverActionError('detach audience', error);
  }
}

/** Saves a draft's inline rules as a new saved audience and links the campaign to it. */
export async function saveCampaignAudienceAs(campaignId: string, name: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireWriter();
  if (!user) return fail('Not authenticated');
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return fail(firstIssue(parsedName.error));
  const campaign = await loadDraft(campaignId);
  if (!campaign) return fail('Campaign not found');
  if (campaign.status !== 'draft') return fail(NOT_DRAFT);
  if (!campaign.audienceRules) {
    return fail('This campaign already uses a saved audience.');
  }

  try {
    const id = await db.transaction(async (tx) => {
      const [audience] = await tx
        .insert(schema.savedAudiences)
        .values({
          name: parsedName.data,
          rules: campaign.audienceRules!,
          createdBy: user.id,
          updatedBy: user.id,
        })
        .returning({ id: schema.savedAudiences.id });
      await tx
        .update(schema.campaigns)
        .set({
          savedAudienceId: audience.id,
          audienceRules: null,
          updatedBy: user.id,
        })
        .where(eq(schema.campaigns.id, campaignId));
      return audience.id;
    });
    await writeAuditLog({
      actorId: user.id,
      action: 'saved_audience.create',
      targetType: 'saved_audience',
      targetId: id,
      metadata: { name: parsedName.data, fromCampaign: campaignId },
    });
    refresh();
    return ok({ id });
  } catch (error) {
    return serverActionError('save audience', error);
  }
}
