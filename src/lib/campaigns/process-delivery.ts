import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import {
  campaignDeliveries,
  campaigns,
  events,
  marketingConsents,
  user,
} from '@/db/schema';
import { db } from '@/utils/db';
import { sendMail } from '@/utils/mail';
import { hasWalletBlock } from './email-markdown';
import { firstNameOf } from './merge-fields';
import { completeCampaignIfDone } from './process-dispatch';
import { getAppBaseUrl } from './render-campaign-email';
import { buildCampaignMessage } from './unsubscribe';
import { walletBlockRenderers, walletLinksFor } from './wallet-block';

/** Attempts after which a still-failing delivery is marked `failed` instead of retried. */
export const MAX_CAMPAIGN_DELIVERY_ATTEMPTS = 8;

export const SKIP_REASONS = {
  stopped: 'Campaign stopped before this was sent',
  unsubscribed: 'Opted out of marketing email after the send started',
  noWallet: 'Sent without the wallet block: no confirmed spot',
} as const;

export type ProcessDeliveryOutcome =
  | 'sent'
  | 'skipped'
  | 'already_done'
  | 'not_found'
  | 'failed';

/**
 * Seconds before a failed delivery is retried: exponential backoff with
 * jitter, so a burst of throttled deliveries (SES "Maximum sending rate
 * exceeded") spreads back out instead of retrying in lockstep.
 */
export function campaignDeliveryRetryDelay(
  deliveryCount: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(300, 2 ** deliveryCount * 5);
  return Math.max(1, Math.round(ceiling / 2 + random() * (ceiling / 2)));
}

/** How a send error should be handled. */
export function classifySendError(
  error: unknown,
): 'throttled' | 'suppressed' | 'permanent' | 'transient' {
  const err = error as {
    responseCode?: number;
    response?: string;
    message?: string;
  };
  const text = `${err?.response ?? ''} ${err?.message ?? ''}`.toLowerCase();
  if (text.includes('suppression list') || text.includes('suppressed')) {
    return 'suppressed';
  }
  if (
    text.includes('throttl') ||
    text.includes('maximum sending rate') ||
    text.includes('rate exceeded')
  ) {
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

async function finish(
  deliveryId: string,
  campaignId: string,
  set: Partial<typeof campaignDeliveries.$inferInsert>,
) {
  await db
    .update(campaignDeliveries)
    .set(set)
    .where(eq(campaignDeliveries.id, deliveryId));
  await completeCampaignIfDone(campaignId);
}

/**
 * Consumer logic for one `campaign-deliveries` message. Returns normally
 * (ack) for every outcome except a retryable send failure, which it rethrows
 * so the queue redelivers it with backoff.
 *
 * A delivery is only sent while its row is `queued`, and the attempt is
 * claimed first with a compare-and-set on `attempts` — so a redelivered or
 * duplicated message can never send the same email twice.
 */
export async function processCampaignDelivery(
  deliveryId: string,
): Promise<ProcessDeliveryOutcome> {
  const [row] = await db
    .select({
      delivery: campaignDeliveries,
      campaign: {
        id: campaigns.id,
        type: campaigns.type,
        status: campaigns.status,
        eventId: campaigns.eventId,
        subject: campaigns.subject,
        previewText: campaigns.previewText,
        bodyMarkdown: campaigns.bodyMarkdown,
      },
      eventName: events.name,
      userName: user.name,
      optedIn: marketingConsents.optedIn,
    })
    .from(campaignDeliveries)
    .innerJoin(campaigns, eq(campaignDeliveries.campaignId, campaigns.id))
    .innerJoin(user, eq(campaignDeliveries.userId, user.id))
    .leftJoin(events, eq(campaigns.eventId, events.id))
    .leftJoin(
      marketingConsents,
      eq(marketingConsents.userId, campaignDeliveries.userId),
    )
    .where(eq(campaignDeliveries.id, deliveryId))
    .limit(1);

  if (!row) return 'not_found';
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

  const [claimed] = await db
    .update(campaignDeliveries)
    .set({ attempts: sql`${campaignDeliveries.attempts} + 1` })
    .where(
      and(
        eq(campaignDeliveries.id, delivery.id),
        eq(campaignDeliveries.status, 'queued'),
        eq(campaignDeliveries.attempts, delivery.attempts),
      ),
    )
    .returning({ attempts: campaignDeliveries.attempts });
  if (!claimed) return 'already_done';

  let note: string | null = null;
  try {
    const baseUrl = getAppBaseUrl();
    let walletLinks = null;
    if (campaign.eventId && hasWalletBlock(campaign.bodyMarkdown)) {
      walletLinks = await walletLinksFor(
        delivery.userId,
        campaign.eventId,
        baseUrl,
      );
      if (!walletLinks) note = SKIP_REASONS.noWallet;
    }
    const message = await buildCampaignMessage(
      {
        type: campaign.type,
        subject: campaign.subject,
        previewText: campaign.previewText,
        bodyMarkdown: campaign.bodyMarkdown,
        eventName: row.eventName,
      },
      { email: delivery.email, firstName: firstNameOf(row.userName) },
      { blocks: walletBlockRenderers(walletLinks, baseUrl) },
    );
    await sendMail(message);
  } catch (error) {
    const kind = classifySendError(error);
    const lastError = errorText(error);
    const giveUp =
      kind === 'suppressed' ||
      kind === 'permanent' ||
      claimed.attempts >= MAX_CAMPAIGN_DELIVERY_ATTEMPTS;
    if (giveUp) {
      await finish(delivery.id, campaign.id, {
        status: 'failed',
        lastError:
          kind === 'suppressed'
            ? `Address is on the SES suppression list: ${lastError}`
            : lastError,
      });
      console.error('[campaigns/delivery] giving up', {
        deliveryId,
        kind,
        attempts: claimed.attempts,
      });
      return 'failed';
    }
    await db
      .update(campaignDeliveries)
      .set({ lastError })
      .where(eq(campaignDeliveries.id, delivery.id));
    throw error;
  }

  await finish(delivery.id, campaign.id, {
    status: 'sent',
    sentAt: new Date(),
    lastError: null,
    skipReason: note,
  });
  return 'sent';
}
