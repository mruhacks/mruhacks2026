import 'server-only';

import { and, eq, lte } from 'drizzle-orm';

import { campaigns } from '@/db/schema';
import { db } from '@/utils/db';
import { publishCampaignDispatch } from './campaign-queue';
import {
  completeCampaignIfDone,
  publishQueuedDeliveries,
} from './process-dispatch';

export type DispatchDueCampaignsResult = {
  due: number;
  published: number;
  publishFailures: number;
};

/**
 * The hourly scheduler's campaign step: publishes a dispatch for every
 * campaign scheduled at or before now. Safe to run twice — the publish is
 * keyed by campaign and scheduled time, and the dispatch handler's
 * `scheduled → sending` claim only ever succeeds once.
 */
export async function dispatchDueCampaigns(
  now: Date = new Date(),
): Promise<DispatchDueCampaignsResult> {
  const due = await db
    .select({ id: campaigns.id, scheduledFor: campaigns.scheduledFor })
    .from(campaigns)
    .where(
      and(eq(campaigns.status, 'scheduled'), lte(campaigns.scheduledFor, now)),
    );

  // Delivery rows are the durable recovery record, including retries whose
  // publisher crashed after committing. Do not rely on another button click.
  const sending = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.status, 'sending'));
  const recovery = await Promise.allSettled(
    sending.map(async ({ id }) => {
      await publishQueuedDeliveries(id);
      await completeCampaignIfDone(id);
    }),
  );
  const results = await Promise.allSettled(
    due.map((row) => publishCampaignDispatch(row.id, row.scheduledFor!)),
  );
  const failures = [...results, ...recovery].filter(
    (r) => r.status === 'rejected',
  );
  if (failures.length > 0) {
    console.error('[campaigns/schedule] some dispatches failed to publish', {
      failures: failures.length,
    });
  }
  const result = {
    due: due.length,
    published: results.filter((r) => r.status === 'fulfilled').length,
    publishFailures: failures.length,
  };
  if (failures.length > 0) {
    // Fail the cron run so it shows up; the next hour retries them.
    throw new AggregateError(
      failures.map((f) => (f as PromiseRejectedResult).reason),
      `Published ${result.published}/${result.due} due campaign dispatches`,
    );
  }
  return result;
}
