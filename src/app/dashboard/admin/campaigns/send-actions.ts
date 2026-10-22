/**
 * Sending a campaign: Send now, Stop, Retry failed, and the results view.
 * Sending, stopping and retrying are `campaign:send:all` (operational
 * campaigns also need `campaign:operational:all`); results are
 * `campaign:read:all`, with the per-recipient list on `participant:read:all`.
 * Every send, stop and retry is audit-logged.
 */

'use server';

import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { z } from 'zod';

import * as schema from '@/db/schema';
import * as Campaigns from '@/lib/campaigns/server';
import * as Rbac from '@/lib/rbac/server';
import { fail, ok, type ActionResult } from '@/utils/action-result';
import { writeAuditLog } from '@/utils/audit-log';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { serverActionError } from '@/utils/server-action-error';

/** Above this many recipients, Send now asks for the count to be typed back. */
const TYPE_TO_CONFIRM_ABOVE = 100;

async function loadCampaign(campaignId: string) {
  if (!z.uuid().safeParse(campaignId).success) return null;
  const [row] = await db
    .select({ campaign: schema.campaigns, eventName: schema.events.name })
    .from(schema.campaigns)
    .leftJoin(schema.events, eq(schema.campaigns.eventId, schema.events.id))
    .where(eq(schema.campaigns.id, campaignId))
    .limit(1);
  return row ?? null;
}

/** Signed in, `campaign:send:all`, and `campaign:operational:all` for operational ones. */
async function requireSender(type: 'marketing' | 'operational' | null) {
  const user = await getUser();
  if (!user) return null;
  await Rbac.requirePermission(user.id, 'campaign:send:all');
  if (type === 'operational') {
    await Rbac.requirePermission(user.id, 'campaign:operational:all');
  }
  return user;
}

export type SendSummary = {
  recipients: number;
  /** Type the count back to confirm when true. */
  requiresTypedConfirmation: boolean;
  /** Anything that has to be fixed first; empty when it can go. */
  problems: string[];
};

/** What the Send now dialog shows: who it reaches right now, and what's blocking it. */
export async function getSendSummary(campaignId: string): Promise<ActionResult<SendSummary>> {
  const row = await loadCampaign(campaignId);
  const user = await requireSender(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');
  const { campaign } = row;

  try {
    const problems = await Campaigns.campaignContentErrors(
      { ...campaign, eventName: row.eventName },
      campaign.eventId,
      'send',
    );
    if (campaign.status !== 'draft') {
      problems.unshift('Only drafts can be sent.');
    }
    const rules = await Campaigns.currentCampaignRules(campaign);
    const recipients = rules
      ? await Campaigns.countAudience(rules, {
          type: campaign.type,
          eventId: campaign.eventId,
        })
      : 0;
    if (recipients === 0) problems.push('Nobody matches this audience yet.');
    return ok({
      recipients,
      requiresTypedConfirmation: recipients > TYPE_TO_CONFIRM_ABOVE,
      problems,
    });
  } catch (error) {
    return serverActionError('check the campaign', error);
  }
}

/**
 * Sends a draft now: marks it `scheduled` for this moment and publishes the
 * dispatch, which claims it the same way the hourly scheduler does. Over
 * 100 recipients, `confirmRecipients` must equal the current count.
 */
export async function sendCampaignNow(campaignId: string, confirmRecipients?: number): Promise<ActionResult> {
  const row = await loadCampaign(campaignId);
  const user = await requireSender(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');

  const summary = await getSendSummary(campaignId);
  if (!summary.success) return summary;
  const { recipients, requiresTypedConfirmation, problems } = summary.data!;
  if (problems.length > 0) return fail(problems[0]);
  if (requiresTypedConfirmation && confirmRecipients !== recipients) {
    return fail(`Type ${recipients.toLocaleString('en-US')} to confirm sending to that many people.`);
  }

  const scheduledFor = new Date();
  const [scheduled] = await db
    .update(schema.campaigns)
    .set({ status: 'scheduled', scheduledFor, updatedBy: user.id })
    .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.status, 'draft')))
    .returning({ id: schema.campaigns.id });
  if (!scheduled) return fail('Only drafts can be sent.');

  try {
    await Campaigns.publishCampaignDispatch(campaignId, scheduledFor);
  } catch (error) {
    // Nothing was queued; put it back so it can be sent again.
    await db
      .update(schema.campaigns)
      .set({ status: 'draft', scheduledFor: null })
      .where(
        and(
          eq(schema.campaigns.id, campaignId),
          eq(schema.campaigns.status, 'scheduled'),
          eq(schema.campaigns.scheduledFor, scheduledFor),
        ),
      );
    return serverActionError('queue the campaign', error);
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'campaign.send',
    targetType: 'campaign',
    targetId: campaignId,
    metadata: { recipientsAtConfirm: recipients },
  });
  refresh();
  return ok();
}

/**
 * Schedules a draft for a whole UTC hour selected from localized slots. The hourly cron dispatches it at or after that
 * hour; the audience is worked out then, not now.
 */
export async function scheduleCampaign(campaignId: string, scheduledForIso: string): Promise<ActionResult> {
  const row = await loadCampaign(campaignId);
  const user = await requireSender(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');

  const parsed = z.iso.datetime({ offset: true }).safeParse(scheduledForIso);
  if (!parsed.success) return fail('Choose a date and hour.');
  const scheduledFor = new Date(parsed.data);
  if (
    scheduledFor.getUTCMinutes() !== 0 ||
    scheduledFor.getUTCSeconds() !== 0 ||
    scheduledFor.getUTCMilliseconds() !== 0
  ) {
    return fail('Campaigns can only be scheduled on the hour.');
  }
  if (scheduledFor.getTime() <= Date.now()) {
    return fail('Choose an hour in the future.');
  }

  const problems = await Campaigns.campaignContentErrors(
    { ...row.campaign, eventName: row.eventName },
    row.campaign.eventId,
    'send',
  );
  if (problems.length > 0) return fail(problems[0]);

  const [scheduled] = await db
    .update(schema.campaigns)
    .set({ status: 'scheduled', scheduledFor, updatedBy: user.id })
    .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.status, 'draft')))
    .returning({ id: schema.campaigns.id });
  if (!scheduled) return fail('Only drafts can be scheduled.');

  await writeAuditLog({
    actorId: user.id,
    action: 'campaign.schedule',
    targetType: 'campaign',
    targetId: campaignId,
    metadata: { scheduledFor: scheduledFor.toISOString() },
  });
  refresh();
  return ok();
}

/** Puts a scheduled campaign back to draft, as long as its dispatch hasn't started. */
export async function unscheduleCampaign(campaignId: string): Promise<ActionResult> {
  const row = await loadCampaign(campaignId);
  const user = await requireSender(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');

  const [draft] = await db
    .update(schema.campaigns)
    .set({ status: 'draft', scheduledFor: null, updatedBy: user.id })
    .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.status, 'scheduled')))
    .returning({ id: schema.campaigns.id });
  if (!draft) {
    return fail('It has already started sending. Use Stop instead.');
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'campaign.unschedule',
    targetType: 'campaign',
    targetId: campaignId,
  });
  refresh();
  return ok();
}

/**
 * Stops a scheduled or sending campaign. Deliveries not yet sent become
 * `skipped`; one already being sent at this instant still goes out.
 */
export async function stopCampaign(campaignId: string): Promise<ActionResult> {
  const row = await loadCampaign(campaignId);
  const user = await requireSender(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');

  try {
    const stopped = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.campaigns)
        .set({ status: 'cancelled', updatedBy: user.id })
        .where(and(eq(schema.campaigns.id, campaignId), inArray(schema.campaigns.status, ['scheduled', 'sending'])))
        .returning({ id: schema.campaigns.id });
      if (!updated) return null;
      const skipped = await tx
        .update(schema.campaignDeliveries)
        .set({
          status: 'skipped',
          skipReason: Campaigns.SKIP_REASONS.stopped,
        })
        .where(
          and(eq(schema.campaignDeliveries.campaignId, campaignId), eq(schema.campaignDeliveries.status, 'queued')),
        )
        .returning({ id: schema.campaignDeliveries.id });
      return skipped.length;
    });
    if (stopped === null) return fail('Only a scheduled or sending campaign can be stopped.');

    await writeAuditLog({
      actorId: user.id,
      action: 'campaign.stop',
      targetType: 'campaign',
      targetId: campaignId,
      metadata: { skipped: stopped },
    });
    refresh();
    return ok();
  } catch (error) {
    return serverActionError('stop the campaign', error);
  }
}

/** Requeues a sent campaign's failed deliveries. */
export async function retryFailedDeliveries(campaignId: string): Promise<ActionResult<{ requeued: number }>> {
  const row = await loadCampaign(campaignId);
  const user = await requireSender(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');
  if (!['sending', 'sent'].includes(row.campaign.status)) {
    return fail('Only a sent campaign can retry its failed deliveries.');
  }

  try {
    const requeued = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, campaignId))
        .for('update');
      if (!current || !['sending', 'sent'].includes(current.status)) {
        throw new Error('Only a sent campaign can retry its failed deliveries.');
      }
      const rows = await tx
        .update(schema.campaignDeliveries)
        .set({ status: 'queued', lastError: null, queuedAt: new Date() })
        .where(
          and(eq(schema.campaignDeliveries.campaignId, campaignId), eq(schema.campaignDeliveries.status, 'failed')),
        )
        .returning({ id: schema.campaignDeliveries.id });
      if (rows.length > 0) {
        await tx.update(schema.campaigns).set({ status: 'sending' }).where(eq(schema.campaigns.id, campaignId));
      }
      return rows.length;
    });
    await Campaigns.publishQueuedDeliveries(campaignId);

    await writeAuditLog({
      actorId: user.id,
      action: 'campaign.retry_failed',
      targetType: 'campaign',
      targetId: campaignId,
      metadata: { requeued },
    });
    refresh();
    return ok({ requeued });
  } catch (error) {
    return serverActionError('retry failed deliveries', error);
  }
}

export type CampaignResults = {
  status: string;
  counts: Record<Campaigns.CampaignDeliveryStatus, number>;
  /** Null without `participant:read:all`. */
  recipients:
    | {
        email: string;
        status: Campaigns.CampaignDeliveryStatus;
        note: string | null;
        sentAt: string | null;
      }[]
    | null;
};

/** Delivery counts, and the per-recipient list for `participant:read:all`. */
export async function getCampaignResults(campaignId: string): Promise<ActionResult<CampaignResults>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requirePermission(user.id, 'campaign:read:all');
  const row = await loadCampaign(campaignId);
  if (!row) return fail('Campaign not found');

  const grouped = await db
    .select({ status: schema.campaignDeliveries.status, c: count() })
    .from(schema.campaignDeliveries)
    .where(eq(schema.campaignDeliveries.campaignId, campaignId))
    .groupBy(schema.campaignDeliveries.status);
  const counts = { queued: 0, sent: 0, failed: 0, skipped: 0 };
  for (const g of grouped) counts[g.status] = Number(g.c);

  let recipients: CampaignResults['recipients'] = null;
  if (await Rbac.hasPermission(user.id, 'participant:read:all')) {
    const rows = await db
      .select({
        email: schema.campaignDeliveries.email,
        status: schema.campaignDeliveries.status,
        skipReason: schema.campaignDeliveries.skipReason,
        lastError: schema.campaignDeliveries.lastError,
        sentAt: schema.campaignDeliveries.sentAt,
      })
      .from(schema.campaignDeliveries)
      .where(eq(schema.campaignDeliveries.campaignId, campaignId))
      .orderBy(
        // Problems first.
        sql`CASE ${schema.campaignDeliveries.status} WHEN 'failed' THEN 0 WHEN 'skipped' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END`,
        asc(schema.campaignDeliveries.email),
      )
      .limit(1000);
    recipients = rows.map((r) => ({
      email: r.email,
      status: r.status,
      note: r.lastError ?? r.skipReason,
      sentAt: r.sentAt?.toISOString() ?? null,
    }));
  }

  return ok({ status: row.campaign.status, counts, recipients });
}
