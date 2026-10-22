import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';

import { campaignDeliveries, campaigns } from '@/db/schema';
import { writeAuditLog } from '@/utils/audit-log';
import { db } from '@/utils/db';
import { resolveAudience } from './audience';
import { deliveryDelaySeconds, publishCampaignDelivery } from './campaign-queue';
import { currentCampaignRules } from './saved-audiences';

export type ProcessDispatchOutcome =
  | { kind: 'dispatched'; recipients: number; published: number }
  | { kind: 'resumed'; published: number }
  | { kind: 'not_found' }
  | { kind: 'stale_schedule' }
  | { kind: 'not_scheduled'; status: string };

/** Delivery rows are written this many at a time. */
const INSERT_CHUNK = 500;
/** Publishes run this many at a time; the queue's own delays do the pacing. */
const PUBLISH_CONCURRENCY = 20;

/**
 * Consumer logic for one `campaign-dispatch` message.
 *
 * Claims the campaign by moving it `scheduled` → `sending` (Send now marks a
 * draft `scheduled` and publishes immediately, so both paths claim the same
 * way and only one dispatch can ever win). In the same transaction it works
 * out the audience *now*, copies the rules it used to `audience_snapshot`,
 * and writes one `queued` delivery row per recipient. Then it publishes a
 * delivery message per row, `floor(i / 10)` seconds apart.
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
    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).for('update').limit(1);
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

    const rules = await currentCampaignRules(campaign);
    if (!rules) throw new Error(`Campaign ${campaignId} has no audience`);
    const recipients = await resolveAudience(rules, {
      type: campaign.type,
      eventId: campaign.eventId,
    });

    await tx
      .update(campaigns)
      .set({
        status: 'sending',
        audienceSnapshot: rules,
        // A send with nobody to send to is done the moment it starts.
        ...(recipients.length === 0 && { status: 'sent', sentAt: new Date() }),
      })
      .where(eq(campaigns.id, campaignId));

    for (let i = 0; i < recipients.length; i += INSERT_CHUNK) {
      await tx
        .insert(campaignDeliveries)
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
      actorId: campaign.updatedBy,
    } as const;
  });

  if (claimed.kind === 'not_found' || claimed.kind === 'not_scheduled' || claimed.kind === 'stale_schedule') {
    return claimed;
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
      id: campaignDeliveries.id,
      attempts: campaignDeliveries.attempts,
    })
    .from(campaignDeliveries)
    .where(and(eq(campaignDeliveries.campaignId, campaignId), eq(campaignDeliveries.status, 'queued')))
    .orderBy(asc(campaignDeliveries.queuedAt), asc(campaignDeliveries.id));

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
    .update(campaigns)
    .set({ status: 'sent', sentAt: new Date() })
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.status, 'sending'),
        sql`NOT EXISTS (
          SELECT 1 FROM ${campaignDeliveries}
           WHERE ${campaignDeliveries.campaignId} = ${campaignId}
             AND ${campaignDeliveries.status} = 'queued'
        )`,
      ),
    )
    .returning({ id: campaigns.id });
  return done.length > 0;
}
