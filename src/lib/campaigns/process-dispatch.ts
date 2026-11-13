import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { writeAuditLog } from '@/utils/audit-log';
import { db } from '@/utils/db';
import { resolveAudience } from './audience';
import { deliveryDelaySeconds, publishCampaignDelivery } from './campaign-queue';

export type ProcessDispatchOutcome =
  | { kind: 'dispatched'; recipients: number; published: number }
  | { kind: 'resumed'; published: number }
  | { kind: 'not_found' }
  | { kind: 'stale_schedule' }
  | { kind: 'not_approved' }
  | { kind: 'not_scheduled'; status: string };

/** Delivery rows are written this many at a time. */
const INSERT_CHUNK = 500;
/** Publishes run this many at a time; the queue's own delays do the pacing. */
const PUBLISH_CONCURRENCY = 20;

/**
 * Consumer logic for one `campaign-dispatch` message.
 *
 * Claims the campaign by moving it `scheduled` → `sending` (approving a
 * send-now request marks it `scheduled` and publishes immediately, so both
 * paths claim the same way and only one dispatch can ever win). In the same
 * transaction it works out *now* who matches the rules frozen in
 * `audience_snapshot` when the send was requested, and writes one `queued`
 * delivery row per recipient. Then it publishes a delivery message per row,
 * `floor(i / 10)` seconds apart.
 *
 * This is the last check before email goes out, so it doesn't take the
 * `scheduled` status on trust: a campaign with no recorded approval, or one
 * whose requester and approver are the same person, is put back to draft
 * instead of sent, whichever code path scheduled it.
 *
 * A redelivered message for a campaign that's already `sending` (the first
 * attempt crashed after claiming) re-publishes its still-queued rows; the
 * queue's idempotency keys make the ones that did go out no-ops.
 */
export async function processCampaignDispatch(
  campaignId: string,
  scheduledFor: string,
): Promise<ProcessDispatchOutcome> {
  const claimed = await db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .for('update')
      .limit(1);
    if (!campaign) return { kind: 'not_found' } as const;
    if (!['scheduled', 'sending'].includes(campaign.status)) {
      return { kind: 'not_scheduled', status: campaign.status } as const;
    }

    if (
      !scheduledFor ||
      campaign.scheduledFor?.toISOString() !== scheduledFor ||
      campaign.scheduledFor.getTime() > Date.now()
    ) {
      return { kind: 'stale_schedule' } as const;
    }
    if (campaign.status === 'sending') return { kind: 'resume' } as const;

    const rules = campaign.audienceSnapshot;
    const samePerson =
      campaign.approvedBy !== null &&
      campaign.approvalRequestedBy !== null &&
      campaign.approvedBy === campaign.approvalRequestedBy;
    if (!campaign.approvedAt || !rules || samePerson) {
      await tx
        .update(schema.campaigns)
        .set({
          status: 'draft',
          scheduledFor: null,
          audienceSnapshot: null,
          approvalRequestedBy: null,
          approvalRequestedAt: null,
          approvedBy: null,
          approvedAt: null,
        })
        .where(eq(schema.campaigns.id, campaignId));
      return { kind: 'not_approved', actorId: campaign.updatedBy } as const;
    }

    const recipients = await resolveAudience(rules, {
      type: campaign.type,
      eventId: campaign.eventId,
    });

    await tx
      .update(schema.campaigns)
      .set({
        status: 'sending',
        // A send with nobody to send to is done the moment it starts.
        ...(recipients.length === 0 && { status: 'sent', sentAt: new Date() }),
      })
      .where(eq(schema.campaigns.id, campaignId));

    for (let i = 0; i < recipients.length; i += INSERT_CHUNK) {
      await tx
        .insert(schema.campaignDeliveries)
        .values(
          recipients.slice(i, i + INSERT_CHUNK).map((recipient) => ({
            campaignId,
            userId: recipient.id,
            email: recipient.email,
          })),
        )
        .onConflictDoNothing();
    }

    return {
      kind: 'claimed',
      rules,
      recipients: recipients.length,
      savedAudienceId: campaign.savedAudienceId,
      requestedBy: campaign.approvalRequestedBy,
      approvedBy: campaign.approvedBy,
      actorId: campaign.updatedBy,
    } as const;
  });

  if (claimed.kind === 'not_found' || claimed.kind === 'not_scheduled' || claimed.kind === 'stale_schedule') {
    return claimed;
  }

  if (claimed.kind === 'not_approved') {
    console.error('[campaigns/dispatch] refused a scheduled campaign with no valid approval', { campaignId });
    await writeAuditLog({
      actorId: claimed.actorId,
      action: 'campaign.dispatch_refused',
      targetType: 'campaign',
      targetId: campaignId,
      metadata: { reason: 'not approved by a second person' },
    });
    return { kind: 'not_approved' };
  }

  if (claimed.kind === 'claimed') {
    await writeAuditLog({
      actorId: claimed.actorId,
      action: 'campaign.dispatch',
      targetType: 'campaign',
      targetId: campaignId,
      metadata: {
        recipients: claimed.recipients,
        audienceRules: claimed.rules,
        savedAudienceId: claimed.savedAudienceId,
        requestedBy: claimed.requestedBy,
        approvedBy: claimed.approvedBy,
      },
    });
  }

  const published = await publishQueuedDeliveries(campaignId);
  return claimed.kind === 'claimed'
    ? { kind: 'dispatched', recipients: claimed.recipients, published }
    : { kind: 'resumed', published };
}

/**
 * Publishes a delivery message for every `queued` row of a campaign, paced
 * at about 10/s. Shared by dispatch and "Retry failed". Each row's
 * `attempts` goes into its idempotency key, so a requeued row isn't taken
 * for a duplicate of its first publish.
 */
export async function publishQueuedDeliveries(campaignId: string): Promise<number> {
  const rows = await db
    .select({
      id: schema.campaignDeliveries.id,
      attempts: schema.campaignDeliveries.attempts,
    })
    .from(schema.campaignDeliveries)
    .where(and(eq(schema.campaignDeliveries.campaignId, campaignId), eq(schema.campaignDeliveries.status, 'queued')))
    .orderBy(asc(schema.campaignDeliveries.queuedAt), asc(schema.campaignDeliveries.id));

  let published = 0;
  const failures: unknown[] = [];
  for (let i = 0; i < rows.length; i += PUBLISH_CONCURRENCY) {
    const batch = rows.slice(i, i + PUBLISH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((row, j) =>
        publishCampaignDelivery(row.id, {
          delaySeconds: deliveryDelaySeconds(i + j),
          round: row.attempts,
        }),
      ),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') published += 1;
      else failures.push(result.reason);
    }
  }

  if (failures.length > 0) {
    // Rethrowing makes the queue redeliver the dispatch message, which
    // resumes here; rows that did publish are deduplicated by key.
    throw new AggregateError(failures, `Published ${published}/${rows.length} deliveries for campaign ${campaignId}`);
  }
  return published;
}

/**
 * Marks a `sending` campaign `sent` once none of its deliveries are still
 * queued. Called after every delivery reaches a final state; the
 * `NOT EXISTS` makes it a no-op until the last one.
 */
export async function completeCampaignIfDone(campaignId: string): Promise<boolean> {
  const done = await db
    .update(schema.campaigns)
    .set({ status: 'sent', sentAt: new Date() })
    .where(
      and(
        eq(schema.campaigns.id, campaignId),
        eq(schema.campaigns.status, 'sending'),
        sql`NOT EXISTS (
          SELECT 1 FROM ${schema.campaignDeliveries}
           WHERE ${schema.campaignDeliveries.campaignId} = ${campaignId}
             AND ${schema.campaignDeliveries.status} = 'queued'
        )`,
      ),
    )
    .returning({ id: schema.campaigns.id });
  return done.length > 0;
}
