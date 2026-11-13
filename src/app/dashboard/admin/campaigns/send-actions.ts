/**
 * Sending a campaign: asking for a send, approving one, Stop, Retry failed,
 * and the results view.
 *
 * A send always takes two people. Someone with `campaign:send:all` asks for
 * it (now, or at a chosen hour), which locks the campaign and freezes its
 * audience rules as `pending_approval`. A *different* person with
 * `campaign:approve:all` then approves it, and only that queues anything.
 * Operational campaigns also need `campaign:operational:all` on both sides.
 * Neither step can be taken from an impersonated session: each of the two
 * has to be a person signed in as themselves.
 *
 * Results are `campaign:read:all`, with the per-recipient list on
 * `participant:read:all`. Every request, approval, rejection, stop and retry
 * is audit-logged.
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
import { getImpersonatedUser, getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { serverActionError } from '@/utils/server-action-error';

/** Above this many recipients, asking for or approving a send needs the count typed back. */
const TYPE_TO_CONFIRM_ABOVE = 100;

/** What a campaign that leaves the approval flow (back to draft) is reset to. */
const NO_APPROVAL = {
  scheduledFor: null,
  audienceSnapshot: null,
  approvalRequestedBy: null,
  approvalRequestedAt: null,
  approvedBy: null,
  approvedAt: null,
} as const;

const OWN_SESSION_ONLY =
  'You’re signed in as someone else. Stop impersonating to ask for or approve a send as yourself.';

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

type CampaignType = 'marketing' | 'operational' | null;

/** Signed in, `campaign:send:all`, and `campaign:operational:all` for operational ones. */
async function requireSender(type: CampaignType) {
  const user = await getUser();
  if (!user) return null;
  await Rbac.requirePermission(user.id, 'campaign:send:all');
  if (type === 'operational') {
    await Rbac.requirePermission(user.id, 'campaign:operational:all');
  }
  return user;
}

/** Signed in, `campaign:approve:all`, and `campaign:operational:all` for operational ones. */
async function requireApprover(type: CampaignType) {
  const user = await getUser();
  if (!user) return null;
  await Rbac.requirePermission(user.id, 'campaign:approve:all');
  if (type === 'operational') {
    await Rbac.requirePermission(user.id, 'campaign:operational:all');
  }
  return user;
}

/** Whether `userId` may ask for a send of this type of campaign right now. */
async function maySend(userId: string, type: CampaignType): Promise<boolean> {
  if (!(await Rbac.hasPermission(userId, 'campaign:send:all'))) return false;
  return type !== 'operational' || Rbac.hasPermission(userId, 'campaign:operational:all');
}

export type SendSummary = {
  recipients: number;
  /** Type the count back to confirm when true. */
  requiresTypedConfirmation: boolean;
  /** Anything that has to be fixed first; empty when it can go. */
  problems: string[];
};

/** Who `rules` reaches right now, and what's wrong with the content. */
async function summarize(
  row: NonNullable<Awaited<ReturnType<typeof loadCampaign>>>,
  rules: Campaigns.AudienceRuleGroup | null,
): Promise<SendSummary> {
  const { campaign } = row;
  const problems = await Campaigns.contentErrors({ ...campaign, eventName: row.eventName }, campaign.eventId, 'send');
  const recipients = rules
    ? await Campaigns.countAudience(rules, {
        type: campaign.type,
        eventId: campaign.eventId,
      })
    : 0;
  if (recipients === 0) problems.push('Nobody matches this audience yet.');
  return {
    recipients,
    requiresTypedConfirmation: recipients > TYPE_TO_CONFIRM_ABOVE,
    problems,
  };
}

/** What the Send now dialog shows: who it reaches right now, and what's blocking it. */
export async function getSendSummary(campaignId: string): Promise<ActionResult<SendSummary>> {
  const row = await loadCampaign(campaignId);
  const user = await requireSender(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');

  try {
    const summary = await summarize(row, await Campaigns.currentCampaignRules(row.campaign));
    if (row.campaign.status !== 'draft') {
      summary.problems.unshift('Only drafts can be sent.');
    }
    return ok(summary);
  } catch (error) {
    return serverActionError('check the campaign', error);
  }
}

/**
 * Moves a draft to `pending_approval`: locks it, freezes the audience rules
 * it has right now, and records who asked and for when (`scheduledFor` null
 * means as soon as it's approved). Nothing is queued.
 */
async function requestApproval(
  row: NonNullable<Awaited<ReturnType<typeof loadCampaign>>>,
  userId: string,
  scheduledFor: Date | null,
  recipientsAtRequest: number | null,
): Promise<ActionResult> {
  const { campaign } = row;
  const rules = await Campaigns.currentCampaignRules(campaign);
  if (!rules) return fail('This campaign has no audience.');

  const [pending] = await db
    .update(schema.campaigns)
    .set({
      status: 'pending_approval',
      scheduledFor,
      audienceSnapshot: rules,
      approvalRequestedBy: userId,
      approvalRequestedAt: new Date(),
      approvedBy: null,
      approvedAt: null,
      updatedBy: userId,
    })
    .where(and(eq(schema.campaigns.id, campaign.id), eq(schema.campaigns.status, 'draft')))
    .returning({ id: schema.campaigns.id });
  if (!pending) return fail('Only drafts can be sent.');

  await writeAuditLog({
    actorId: userId,
    action: 'campaign.approval_requested',
    targetType: 'campaign',
    targetId: campaign.id,
    metadata: {
      sendAt: scheduledFor?.toISOString() ?? 'on approval',
      recipientsAtRequest,
      audienceRules: rules,
      savedAudienceId: campaign.savedAudienceId,
    },
  });
  refresh();
  return ok();
}

/**
 * Asks for a draft to be sent as soon as someone else approves it. Over 100
 * recipients, `confirmRecipients` must equal the current count.
 */
export async function requestSendNow(campaignId: string, confirmRecipients?: number): Promise<ActionResult> {
  const row = await loadCampaign(campaignId);
  const user = await requireSender(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');
  if (await getImpersonatedUser()) return fail(OWN_SESSION_ONLY);

  const summary = await getSendSummary(campaignId);
  if (!summary.success) return summary;
  const { recipients, requiresTypedConfirmation, problems } = summary.data!;
  if (problems.length > 0) return fail(problems[0]);
  if (requiresTypedConfirmation && confirmRecipients !== recipients) {
    return fail(`Type ${recipients.toLocaleString('en-US')} to confirm sending to that many people.`);
  }

  try {
    return await requestApproval(row, user.id, null, recipients);
  } catch (error) {
    return serverActionError('ask for approval', error);
  }
}

/**
 * Asks for a draft to be sent at a whole UTC hour selected from localized
 * slots, once someone else approves it. The hourly cron dispatches it at or
 * after that hour; who matches the frozen rules is worked out then, not now.
 */
export async function requestSchedule(campaignId: string, scheduledForIso: string): Promise<ActionResult> {
  const row = await loadCampaign(campaignId);
  const user = await requireSender(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');
  if (await getImpersonatedUser()) return fail(OWN_SESSION_ONLY);

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

  try {
    const problems = await Campaigns.contentErrors(
      { ...row.campaign, eventName: row.eventName },
      row.campaign.eventId,
      'send',
    );
    if (problems.length > 0) return fail(problems[0]);
    return await requestApproval(row, user.id, scheduledFor, null);
  } catch (error) {
    return serverActionError('ask for approval', error);
  }
}

export type ApprovalSummary = SendSummary & {
  /** The hour that was asked for; null means it goes out as soon as it's approved. */
  scheduledFor: string | null;
};

/**
 * Why `userId` can't approve this request, or null when they can. Kept apart
 * from the permission check: these are the two-person rules themselves.
 */
async function approvalBlocker(campaign: typeof schema.campaigns.$inferSelect, userId: string): Promise<string | null> {
  if (campaign.status !== 'pending_approval') return 'This campaign isn’t waiting for approval.';
  if (!campaign.approvalRequestedBy) {
    return 'Whoever asked for this send no longer has an account. Send it back to draft and ask again.';
  }
  if (campaign.approvalRequestedBy === userId) {
    return 'You asked for this send, so someone else has to approve it.';
  }
  // Someone who has since lost access can't have a send go out in their name.
  if (!(await maySend(campaign.approvalRequestedBy, campaign.type))) {
    return 'Whoever asked for this send can no longer send campaigns. Send it back to draft and ask again.';
  }
  if (campaign.scheduledFor && campaign.scheduledFor.getTime() <= Date.now()) {
    return 'The time this was meant to send has passed. Send it back to draft and pick a new one.';
  }
  return null;
}

/** What the Approve dialog shows: who the frozen rules reach right now, and what's blocking it. */
export async function getApprovalSummary(campaignId: string): Promise<ActionResult<ApprovalSummary>> {
  const row = await loadCampaign(campaignId);
  const user = await requireApprover(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');

  try {
    const summary = await summarize(row, row.campaign.audienceSnapshot);
    const blocker = await approvalBlocker(row.campaign, user.id);
    if (blocker) summary.problems.unshift(blocker);
    return ok({ ...summary, scheduledFor: row.campaign.scheduledFor?.toISOString() ?? null });
  } catch (error) {
    return serverActionError('check the campaign', error);
  }
}

/**
 * Approves someone else's request. A request for a set hour becomes
 * `scheduled` for it; one with no hour is marked `scheduled` for this moment
 * and its dispatch published, which claims it the same way the hourly
 * scheduler does. Over 100 recipients, `confirmRecipients` must equal the
 * current count.
 */
export async function approveCampaign(campaignId: string, confirmRecipients?: number): Promise<ActionResult> {
  const row = await loadCampaign(campaignId);
  const user = await requireApprover(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');
  if (await getImpersonatedUser()) return fail(OWN_SESSION_ONLY);

  const summary = await getApprovalSummary(campaignId);
  if (!summary.success) return summary;
  const { recipients, requiresTypedConfirmation, problems } = summary.data!;
  if (problems.length > 0) return fail(problems[0]);
  if (requiresTypedConfirmation && confirmRecipients !== recipients) {
    return fail(`Type ${recipients.toLocaleString('en-US')} to confirm sending to that many people.`);
  }

  const { campaign } = row;
  const requestedBy = campaign.approvalRequestedBy!;
  const sendNow = campaign.scheduledFor === null;
  const scheduledFor = campaign.scheduledFor ?? new Date();
  const [approved] = await db
    .update(schema.campaigns)
    .set({ status: 'scheduled', scheduledFor, approvedBy: user.id, approvedAt: new Date() })
    .where(
      and(
        eq(schema.campaigns.id, campaignId),
        eq(schema.campaigns.status, 'pending_approval'),
        // The request that was checked above, not one made since.
        eq(schema.campaigns.approvalRequestedBy, requestedBy),
        eq(schema.campaigns.approvalRequestedAt, campaign.approvalRequestedAt!),
      ),
    )
    .returning({ id: schema.campaigns.id });
  if (!approved) return fail('This campaign isn’t waiting for approval any more.');

  if (sendNow) {
    try {
      await Campaigns.publishCampaignDispatch(campaignId, scheduledFor);
    } catch (error) {
      // Nothing was queued; put it back so it can be approved again.
      await db
        .update(schema.campaigns)
        .set({ status: 'pending_approval', scheduledFor: null, approvedBy: null, approvedAt: null })
        .where(
          and(
            eq(schema.campaigns.id, campaignId),
            eq(schema.campaigns.status, 'scheduled'),
            eq(schema.campaigns.scheduledFor, scheduledFor),
          ),
        );
      return serverActionError('queue the campaign', error);
    }
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'campaign.approved',
    targetType: 'campaign',
    targetId: campaignId,
    metadata: {
      requestedBy,
      sendAt: sendNow ? 'now' : scheduledFor.toISOString(),
      recipientsAtApproval: recipients,
    },
  });
  refresh();
  return ok();
}

/**
 * Sends a request back to draft without sending anything: the person who
 * asked withdrawing it, or anyone who could have approved it turning it down.
 */
export async function cancelApprovalRequest(campaignId: string): Promise<ActionResult> {
  const row = await loadCampaign(campaignId);
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requireAnyPermission(user.id, ['campaign:send:all', 'campaign:approve:all']);
  if (row?.campaign.type === 'operational') {
    await Rbac.requirePermission(user.id, 'campaign:operational:all');
  }
  if (!row) return fail('Campaign not found');

  const [draft] = await db
    .update(schema.campaigns)
    .set({ status: 'draft', ...NO_APPROVAL, updatedBy: user.id })
    .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.status, 'pending_approval')))
    .returning({ id: schema.campaigns.id });
  if (!draft) return fail('This campaign isn’t waiting for approval any more.');

  const requestedBy = row.campaign.approvalRequestedBy;
  await writeAuditLog({
    actorId: user.id,
    action: requestedBy === user.id ? 'campaign.approval_withdrawn' : 'campaign.approval_rejected',
    targetType: 'campaign',
    targetId: campaignId,
    metadata: { requestedBy },
  });
  refresh();
  return ok();
}

/**
 * Puts a scheduled campaign back to draft, as long as its dispatch hasn't
 * started. Its approval goes with it: sending it again means asking again.
 */
export async function unscheduleCampaign(campaignId: string): Promise<ActionResult> {
  const row = await loadCampaign(campaignId);
  const user = await requireSender(row?.campaign.type ?? null);
  if (!user) return fail('Not authenticated');
  if (!row) return fail('Campaign not found');

  const [draft] = await db
    .update(schema.campaigns)
    .set({ status: 'draft', ...NO_APPROVAL, updatedBy: user.id })
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
  counts: Record<Campaigns.DeliveryStatus, number>;
  /** Null without `participant:read:all`. */
  recipients:
    | {
        email: string;
        status: Campaigns.DeliveryStatus;
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
