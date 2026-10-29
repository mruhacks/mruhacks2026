import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { db } from '@/utils/db';
import { sendMail } from '@/utils/mail';
import { hasWalletBlock } from './email-markdown';
import { firstNameOf } from './merge-fields';
import { completeCampaignIfDone } from './process-dispatch';
import { getAppBaseUrl } from './render-campaign-email';
import { buildCampaignMessage } from './unsubscribe';
import { walletBlockRenderers, walletLinksFor } from './wallet-block';

/** Attempts after which a still-failing delivery is marked `failed` instead of retried. */
const MAX_CAMPAIGN_DELIVERY_ATTEMPTS = 8;

export const SKIP_REASONS = {
  stopped: 'Campaign stopped before this was sent',
  unsubscribed: 'Opted out of marketing email after the send started',
  noWallet: 'Sent without the wallet block: no confirmed spot',
} as const;

export type ProcessDeliveryOutcome = 'sent' | 'skipped' | 'already_done' | 'not_found' | 'failed';

/**
 * Seconds before a failed delivery is retried: exponential backoff with
 * jitter, so a burst of throttled deliveries (SES "Maximum sending rate
 * exceeded") spreads back out instead of retrying in lockstep.
 */
export function deliveryRetryDelay(deliveryCount: number, random: () => number = Math.random): number {
  const ceiling = Math.min(300, 2 ** deliveryCount * 5);
  return Math.max(1, Math.round(ceiling / 2 + random() * (ceiling / 2)));
}

/** How a send error should be handled. */
function classifySendError(error: unknown): 'throttled' | 'suppressed' | 'permanent' | 'transient' {
  const err = error as {
    responseCode?: number;
    response?: string;
    message?: string;
  };
  const text = `${err?.response ?? ''} ${err?.message ?? ''}`.toLowerCase();
  if (text.includes('suppression list') || text.includes('suppressed')) {
    return 'suppressed';
  }
  if (text.includes('throttl') || text.includes('maximum sending rate') || text.includes('rate exceeded')) {
    return 'throttled';
  }
  if (typeof err?.responseCode === 'number' && err.responseCode >= 500) {
    return 'permanent';
  }
  return 'transient';
}

function errorText(error: unknown): string {
  const err = error as { response?: string; message?: string };
  return (err?.response || err?.message || 'Unknown send error').slice(0, 500);
}

function deliveryQuery(deliveryId: string, query: Pick<typeof db, 'select'> = db) {
  return query
    .select({
      delivery: schema.campaignDeliveries,
      campaign: {
        id: schema.campaigns.id,
        type: schema.campaigns.type,
        status: schema.campaigns.status,
        eventId: schema.campaigns.eventId,
        subject: schema.campaigns.subject,
        previewText: schema.campaigns.previewText,
        bodyMarkdown: schema.campaigns.bodyMarkdown,
      },
      eventName: schema.events.name,
      userName: schema.user.name,
      optedIn: schema.marketingConsents.optedIn,
    })
    .from(schema.campaignDeliveries)
    .innerJoin(schema.campaigns, eq(schema.campaignDeliveries.campaignId, schema.campaigns.id))
    .innerJoin(schema.user, eq(schema.campaignDeliveries.userId, schema.user.id))
    .leftJoin(schema.events, eq(schema.campaigns.eventId, schema.events.id))
    .leftJoin(schema.marketingConsents, eq(schema.marketingConsents.userId, schema.campaignDeliveries.userId))
    .where(eq(schema.campaignDeliveries.id, deliveryId))
    .limit(1);
}

/**
 * Consumer logic for one `campaign-deliveries` message. Returns normally
 * (ack) for every outcome except a retryable send failure, which it rethrows
 * so the queue redelivers it with backoff.
 *
 * Hold an exclusive row lock through SMTP and the final update.
 * Overlapping consumers skip the locked row. A terminated worker releases
 * its lock automatically, leaving the queued row available for redelivery.
 * SMTP acceptance and the DB commit are not atomic; a crash between them
 * still has the usual at-least-once delivery ambiguity.
 */
export async function processCampaignDelivery(deliveryId: string): Promise<ProcessDeliveryOutcome> {
  const [initial] = await deliveryQuery(deliveryId);
  if (!initial) return 'not_found';
  if (initial.delivery.status !== 'queued') return 'already_done';
  // Rendering may perform wallet lookups and register signing keys. Do it
  // before reserving a transaction connection so concurrent workers cannot
  // exhaust the pool while waiting for these additional queries.
  const { delivery, campaign } = initial;
  let message: Awaited<ReturnType<typeof buildCampaignMessage>> | undefined;
  let renderError: unknown;
  let note: string | null = null;
  try {
    const baseUrl = getAppBaseUrl();
    let walletLinks = null;
    if (campaign.eventId && hasWalletBlock(campaign.bodyMarkdown)) {
      walletLinks = await walletLinksFor(delivery.userId, campaign.eventId, baseUrl);
      if (!walletLinks) note = SKIP_REASONS.noWallet;
    }
    message = await buildCampaignMessage(
      {
        type: campaign.type,
        subject: campaign.subject,
        previewText: campaign.previewText,
        bodyMarkdown: campaign.bodyMarkdown,
        eventName: initial.eventName,
      },
      { email: delivery.email, firstName: firstNameOf(initial.userName) },
      { blocks: walletBlockRenderers(walletLinks, baseUrl) },
    );
  } catch (error) {
    renderError = error;
  }

  const result = await db.transaction(async (tx) => {
    let campaignId: string | undefined;
    async function finish(deliveryId: string, id: string, set: Partial<typeof schema.campaignDeliveries.$inferInsert>) {
      campaignId = id;
      await tx.update(schema.campaignDeliveries).set(set).where(eq(schema.campaignDeliveries.id, deliveryId));
    }
    const outcome = await attempt();
    return { outcome, campaignId };

    async function attempt(): Promise<ProcessDeliveryOutcome | { retry: unknown }> {
      const [row] = await deliveryQuery(deliveryId, tx).for('update', {
        of: schema.campaignDeliveries,
        skipLocked: true,
      });

      if (!row) {
        const [existing] = await tx
          .select({ id: schema.campaignDeliveries.id })
          .from(schema.campaignDeliveries)
          .where(eq(schema.campaignDeliveries.id, deliveryId));
        return existing ? 'already_done' : 'not_found';
      }
      const { delivery, campaign } = row;
      if (delivery.status !== 'queued') return 'already_done';

      if (campaign.status === 'cancelled') {
        await finish(delivery.id, campaign.id, {
          status: 'skipped',
          skipReason: SKIP_REASONS.stopped,
        });
        return 'skipped';
      }
      // Consent is checked again here, not just at dispatch: someone who
      // unsubscribes mid-send must not get the email.
      if (campaign.type === 'marketing' && !row.optedIn) {
        await finish(delivery.id, campaign.id, {
          status: 'skipped',
          skipReason: SKIP_REASONS.unsubscribed,
        });
        return 'skipped';
      }

      const [claimed] = await tx
        .update(schema.campaignDeliveries)
        .set({ attempts: sql`${schema.campaignDeliveries.attempts} + 1` })
        .where(
          and(
            eq(schema.campaignDeliveries.id, delivery.id),
            eq(schema.campaignDeliveries.status, 'queued'),
            eq(schema.campaignDeliveries.attempts, delivery.attempts),
          ),
        )
        .returning({ attempts: schema.campaignDeliveries.attempts });
      if (!claimed) return 'already_done';

      try {
        if (!message) throw renderError;
        await sendMail(message);
      } catch (error) {
        const kind = classifySendError(error);
        const lastError = errorText(error);
        const giveUp =
          kind === 'suppressed' || kind === 'permanent' || claimed.attempts >= MAX_CAMPAIGN_DELIVERY_ATTEMPTS;
        if (giveUp) {
          await finish(delivery.id, campaign.id, {
            status: 'failed',
            lastError: kind === 'suppressed' ? `Address is on the SES suppression list: ${lastError}` : lastError,
          });
          console.error('[campaigns/delivery] giving up', {
            deliveryId,
            kind,
            attempts: claimed.attempts,
          });
          return 'failed';
        }
        await tx
          .update(schema.campaignDeliveries)
          .set({ lastError })
          .where(eq(schema.campaignDeliveries.id, delivery.id));
        return { retry: error };
      }

      await finish(delivery.id, campaign.id, {
        status: 'sent',
        sentAt: new Date(),
        lastError: null,
        skipReason: note,
      });
      return 'sent';
    }
  });
  // Release the delivery lock before locking the campaign, matching Stop's
  // campaign → delivery lock order and avoiding a deadlock.
  if (result.campaignId) await completeCampaignIfDone(result.campaignId);
  if (typeof result.outcome === 'object') throw result.outcome.retry;
  return result.outcome;
}
