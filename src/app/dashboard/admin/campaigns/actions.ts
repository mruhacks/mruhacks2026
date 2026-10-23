/**
 * Server actions for email campaigns.
 *
 * Every campaign is shared: anyone holding the permission can edit or send
 * any of them. Each action checks the one permission behind its own feature
 * (AGENTS.md): `campaign:write:all` for drafts and the audience builder,
 * `campaign:operational:all` on top of it for anything operational, and
 * `participant:read:all` for the recipient preview list (the count alone
 * needs only `campaign:write:all`).
 */

'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { z } from 'zod';

import * as schema from '@/db/schema';
import { ADMIN_COUNTS_CACHE_TAG } from '@/lib/admin-counts';
import * as Campaigns from '@/lib/campaigns/server';
import * as Rbac from '@/lib/rbac/server';
import { fail, ok, type ActionResult } from '@/utils/action-result';
import { writeAuditLog } from '@/utils/audit-log';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { sendMail } from '@/utils/mail';
import { campaignImageUrl, putObject } from '@/utils/object-storage';
import { serverActionError } from '@/utils/server-action-error';
import {
  audienceQuerySchema,
  createCampaignSchema,
  type AudienceQueryInput,
  type CreateCampaignInput,
} from './schemas';

/** How many recipients the preview list shows. */
const PREVIEW_SIZE = 25;

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

/** Operational email must be about a top-level event that exists. */
async function checkCampaignEvent(eventId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), isNull(schema.events.parentEventId)))
    .limit(1);
  return row ? null : 'Choose an event (not a sub-event) for this campaign.';
}

// ── Campaign drafts ────────────────────────────────────────────────────────

export async function createCampaign(input: CreateCampaignInput): Promise<ActionResult<{ id: string }>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requirePermission(user.id, 'campaign:write:all');

  const parsed = createCampaignSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { name, type } = parsed.data;
  const eventId = parsed.data.eventId;

  if (type === 'operational') {
    await Rbac.requirePermission(user.id, 'campaign:operational:all');
  }
  if (eventId) {
    const eventError = await checkCampaignEvent(eventId);
    if (eventError) return fail(eventError);
  }

  try {
    const [row] = await db
      .insert(schema.campaigns)
      .values({
        name,
        type,
        eventId,
        audienceRules: Campaigns.emptyAudience(),
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning({ id: schema.campaigns.id });
    updateTag(ADMIN_COUNTS_CACHE_TAG);
    await writeAuditLog({
      actorId: user.id,
      action: 'campaign.create',
      targetType: 'campaign',
      targetId: row.id,
      metadata: { name, type, eventId },
    });
    return ok({ id: row.id });
  } catch (error) {
    return serverActionError('create campaign', error);
  }
}

/**
 * Loads a campaign for editing: it must exist and still be a draft — a
 * scheduled, sending or sent campaign is read-only.
 */
async function loadEditableCampaign(
  campaignId: string,
): Promise<{ ok: true; campaign: typeof schema.campaigns.$inferSelect } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(campaignId).success) {
    return { ok: false, error: 'Campaign not found' };
  }
  const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId)).limit(1);
  if (!row) return { ok: false, error: 'Campaign not found' };
  if (row.status !== 'draft') {
    return {
      ok: false,
      error: 'Only drafts can be edited. Unschedule it first.',
    };
  }
  return { ok: true, campaign: row };
}

/** Replaces a draft's inline audience rules. */
export async function updateCampaignAudience(
  campaignId: string,
  rules: Campaigns.AudienceRuleGroup,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requirePermission(user.id, 'campaign:write:all');

  const parsed = Campaigns.audienceRulesSchema.safeParse(rules);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const loaded = await loadEditableCampaign(campaignId);
  if (!loaded.ok) return fail(loaded.error);
  if (loaded.campaign.savedAudienceId) {
    return fail('This campaign uses a saved audience. Detach it to edit.');
  }

  try {
    await db
      .update(schema.campaigns)
      .set({ audienceRules: parsed.data, updatedBy: user.id })
      .where(eq(schema.campaigns.id, campaignId));
    return ok();
  } catch (error) {
    return serverActionError('save audience', error);
  }
}

// ── Audience builder ───────────────────────────────────────────────────────

async function parseAudienceQuery(
  input: AudienceQueryInput,
): Promise<{ rules: Campaigns.AudienceRuleGroup; context: Campaigns.AudienceContext } | { error: string }> {
  const parsed = audienceQuerySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { context, rules } = parsed.data;
  if (context.type === 'operational' && context.eventId) {
    const eventError = await checkCampaignEvent(context.eventId);
    if (eventError) return { error: eventError };
  }
  return { rules, context };
}

/** Live recipient count for the builder. Available to campaign readers and writers. */
export async function countAudienceForBuilder(input: AudienceQueryInput): Promise<ActionResult<number>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requireAnyPermission(user.id, ['campaign:read:all', 'campaign:write:all']);

  const query = await parseAudienceQuery(input);
  if ('error' in query) return fail(query.error);
  try {
    return ok(await Campaigns.countAudience(query.rules, query.context));
  } catch (error) {
    return serverActionError('count recipients', error);
  }
}

/**
 * A sample of who the audience reaches. Names and emails are participant
 * data, so this needs `participant:read:all` as well as campaign read or write access,
 * and refuses (rather than redirecting) without it.
 */
export async function previewAudienceForBuilder(
  input: AudienceQueryInput,
): Promise<ActionResult<Campaigns.AudienceMember[]>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requireAnyPermission(user.id, ['campaign:read:all', 'campaign:write:all']);
  if (!(await Rbac.hasPermission(user.id, 'participant:read:all'))) {
    return fail("You don't have permission to see recipients.");
  }

  const query = await parseAudienceQuery(input);
  if ('error' in query) return fail(query.error);
  try {
    return ok(await Campaigns.sampleAudience(query.rules, query.context, PREVIEW_SIZE));
  } catch (error) {
    return serverActionError('preview recipients', error);
  }
}

// ── Content ────────────────────────────────────────────────────────────────

const contentSchema = z.object({
  name: z.string().trim().min(1, 'Give the campaign a name.').max(200),
  subject: z.string().max(300, 'Keep the subject under 300 characters.'),
  previewText: z.string().max(300, 'Keep the preview text under 300 characters.'),
  bodyMarkdown: z.string().max(100_000, 'The email body is too long.'),
});
export type CampaignContentInput = z.input<typeof contentSchema>;

/**
 * Saves a draft's name, subject, preview text and body (the composer
 * autosaves through this). An unknown `{{…}}` merge field is refused.
 */
export async function updateCampaignContent(
  campaignId: string,
  input: CampaignContentInput,
): Promise<ActionResult<{ updatedAt: string }>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requirePermission(user.id, 'campaign:write:all');

  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const loaded = await loadEditableCampaign(campaignId);
  if (!loaded.ok) return fail(loaded.error);

  const [contentError] = await Campaigns.contentErrors(parsed.data, loaded.campaign.eventId, 'draft');
  if (contentError) return fail(contentError);

  try {
    const [row] = await db
      .update(schema.campaigns)
      .set({ ...parsed.data, updatedBy: user.id })
      .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.status, 'draft')))
      .returning({ updatedAt: schema.campaigns.updatedAt });
    if (!row) return fail('Only drafts can be edited. Unschedule it first.');
    return ok({ updatedAt: row.updatedAt.toISOString() });
  } catch (error) {
    return serverActionError('save campaign', error);
  }
}

async function loadCampaignWithEvent(campaignId: string) {
  if (!z.uuid().safeParse(campaignId).success) return null;
  const [row] = await db
    .select({ campaign: schema.campaigns, eventName: schema.events.name })
    .from(schema.campaigns)
    .leftJoin(schema.events, eq(schema.campaigns.eventId, schema.events.id))
    .where(eq(schema.campaigns.id, campaignId))
    .limit(1);
  return row ?? null;
}

/**
 * Renders the composer's current (possibly unsaved) content exactly as it
 * will be sent, merge fields filled in for the signed-in user.
 */
export async function previewCampaignEmail(
  campaignId: string,
  input: Omit<CampaignContentInput, 'name'>,
): Promise<ActionResult<{ subject: string; html: string }>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requirePermission(user.id, 'campaign:read:all');

  const parsed = contentSchema.omit({ name: true }).safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const row = await loadCampaignWithEvent(campaignId);
  if (!row) return fail('Campaign not found');

  try {
    const baseUrl = Campaigns.getAppBaseUrl();
    const email = await Campaigns.renderCampaignEmail(
      { ...parsed.data, type: row.campaign.type, eventName: row.eventName },
      { firstName: Campaigns.firstNameOf(user.name) },
      { baseUrl, blocks: Campaigns.walletBlockRenderers('placeholder', baseUrl) },
    );
    return ok({ subject: email.subject, html: email.html });
  } catch (error) {
    return serverActionError('preview email', error);
  }
}

/**
 * Sends the campaign's saved content to the signed-in user only. Always
 * available with `campaign:write:all` and in any status, and it ignores
 * marketing consent: it's the author checking their own work.
 */
export async function sendCampaignTest(campaignId: string): Promise<ActionResult<{ to: string }>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requirePermission(user.id, 'campaign:write:all');

  const row = await loadCampaignWithEvent(campaignId);
  if (!row) return fail('Campaign not found');
  const content = {
    type: row.campaign.type,
    subject: row.campaign.subject,
    previewText: row.campaign.previewText,
    bodyMarkdown: row.campaign.bodyMarkdown,
    eventName: row.eventName,
  };
  const [problem] = await Campaigns.contentErrors(content, row.campaign.eventId, 'send');
  if (problem) return fail(problem);

  try {
    // The tester's own wallet links if they hold a spot, so they can try
    // them; otherwise inert badges, so they still see the block.
    const baseUrl = Campaigns.getAppBaseUrl();
    const walletLinks =
      Campaigns.hasWalletBlock(content.bodyMarkdown) && row.campaign.eventId
        ? await Campaigns.walletLinksFor(user.id, row.campaign.eventId, baseUrl)
        : null;
    await sendMail(
      await Campaigns.buildCampaignMessage(
        content,
        { email: user.email, firstName: Campaigns.firstNameOf(user.name) },
        {
          subjectPrefix: '[Test] ',
          blocks: Campaigns.walletBlockRenderers(walletLinks ?? 'placeholder', baseUrl),
        },
      ),
    );
    await writeAuditLog({
      actorId: user.id,
      action: 'campaign.test_send',
      targetType: 'campaign',
      targetId: campaignId,
    });
    return ok({ to: user.email });
  } catch (error) {
    return serverActionError('send test email', error);
  }
}

// ── Images ─────────────────────────────────────────────────────────────────

/**
 * Uploads an image for a campaign body to the public `campaign-content/`
 * prefix, optimized for email. Returns the stable `/api/assets/…` URL the
 * body embeds. Campaign images are never deleted while their campaign
 * exists: nothing in the app deletes under this prefix.
 */
export async function uploadCampaignImage(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requirePermission(user.id, 'campaign:write:all');

  const value = formData.get('file');
  if (!value || typeof value === 'string' || typeof value.arrayBuffer !== 'function') {
    return fail('Choose an image to upload.');
  }
  if (!Campaigns.IMAGE_INPUT_TYPES.has(value.type)) {
    return fail('Images must be JPEG, PNG, WebP, GIF, AVIF or HEIC.');
  }
  if (value.size === 0 || value.size > Campaigns.MAX_CAMPAIGN_IMAGE_BYTES) {
    return fail(`Images must be smaller than ${Campaigns.MAX_CAMPAIGN_IMAGE_BYTES / 1024 / 1024} MB.`);
  }

  let image: Awaited<ReturnType<typeof Campaigns.optimizeCampaignImage>>;
  try {
    image = await Campaigns.optimizeCampaignImage(new Uint8Array(await value.arrayBuffer()));
  } catch (error) {
    console.error('[campaigns] image processing failed', error);
    return fail('That file could not be read as an image.');
  }

  try {
    await putObject({
      key: image.key,
      body: image.body,
      contentType: image.contentType,
    });
    return ok({ url: campaignImageUrl(image.key) });
  } catch (error) {
    return serverActionError('upload image', error);
  }
}
