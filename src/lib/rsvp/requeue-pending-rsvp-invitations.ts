import 'server-only';

import { and, eq, lt } from 'drizzle-orm';

import { eventRsvpResponses, eventRsvpWaves, rsvpStatuses } from '@/db/schema';
import { isEffectivePendingRsvp } from '@/lib/rsvp/effective-rsvp-status';
import { publishRsvpInvitation } from '@/lib/rsvp/rsvp-invitation-queue';
import { db } from '@/utils/db';

/** Minimum age before an 'unsent' row is treated as stuck rather than mid-flight. */
const STALE_UNSENT_THRESHOLD_MS = 5 * 60 * 1000;

export type RequeuePendingRsvpInvitationsOptions = {
  /** Clock override for tests. Defaults to now. */
  now?: Date;
};

export type RequeuePendingRsvpInvitationsResult = {
  inspected: number;
  queued: number;
  skipped: number;
  publishFailures: number;
};

/**
 * Republishes queue messages for `unsent` RSVP responses whose original
 * publish likely failed or never happened. Only touches `unsent` rows older
 * than the safety threshold — `legacy`, `queued`, `sent`, and `failed` rows
 * are left alone. Never sends email directly; only republishes queue jobs.
 */
export async function requeuePendingRsvpInvitations(
  options: RequeuePendingRsvpInvitationsOptions = {},
): Promise<RequeuePendingRsvpInvitationsResult> {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - STALE_UNSENT_THRESHOLD_MS);

  const candidates = await db
    .select({
      responseId: eventRsvpResponses.id,
      statusLabel: rsvpStatuses.label,
      respondBy: eventRsvpWaves.respondBy,
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .leftJoin(rsvpStatuses, eq(eventRsvpResponses.statusId, rsvpStatuses.id))
    .where(
      and(
        eq(eventRsvpResponses.invitationEmailStatus, 'unsent'),
        lt(eventRsvpResponses.createdAt, staleBefore),
      ),
    );

  let queued = 0;
  let skipped = 0;
  let publishFailures = 0;

  for (const candidate of candidates) {
    if (
      !isEffectivePendingRsvp(candidate.statusLabel, candidate.respondBy, now)
    ) {
      skipped += 1;
      continue;
    }

    try {
      await publishRsvpInvitation(candidate.responseId);
      // Consumer may already have processed and marked this 'sent' by the
      // time this update runs — never regress it back to 'queued'.
      await db
        .update(eventRsvpResponses)
        .set({
          invitationEmailStatus: 'queued',
          invitationEmailQueuedAt: new Date(),
        })
        .where(
          and(
            eq(eventRsvpResponses.id, candidate.responseId),
            eq(eventRsvpResponses.invitationEmailStatus, 'unsent'),
          ),
        );
      queued += 1;
    } catch (error) {
      publishFailures += 1;
      console.error('[requeuePendingRsvpInvitations] failed to publish', {
        responseId: candidate.responseId,
        error,
      });
    }
  }

  return {
    inspected: candidates.length,
    queued,
    skipped,
    publishFailures,
  };
}
