import 'server-only';

import { and, eq, lt } from 'drizzle-orm';

import {
  eventInvitations,
  eventParticipants,
  eventRsvpWaves,
  participationStatuses,
} from '@/db/schema';
import { resolveEffectiveStatus } from '@/lib/participation/status';
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
 * Republishes queue messages for `unsent` RSVP invitations whose original
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
      responseId: eventInvitations.id,
      statusLabel: participationStatuses.label,
      respondBy: eventRsvpWaves.respondBy,
    })
    .from(eventInvitations)
    .innerJoin(
      eventRsvpWaves,
      eq(eventInvitations.rsvpWaveId, eventRsvpWaves.id),
    )
    .innerJoin(
      eventParticipants,
      eq(eventInvitations.participantId, eventParticipants.id),
    )
    .innerJoin(
      participationStatuses,
      eq(eventParticipants.statusId, participationStatuses.id),
    )
    .where(
      and(
        eq(eventInvitations.invitationEmailStatus, 'unsent'),
        lt(eventInvitations.createdAt, staleBefore),
      ),
    );

  let queued = 0;
  let skipped = 0;
  let publishFailures = 0;

  for (const candidate of candidates) {
    if (
      resolveEffectiveStatus(
        candidate.statusLabel,
        candidate.respondBy,
        now,
      ) !== 'invited'
    ) {
      skipped += 1;
      continue;
    }

    try {
      await publishRsvpInvitation(candidate.responseId);
      // Consumer may already have processed and marked this 'sent' by the
      // time this update runs — never regress it back to 'queued'.
      await db
        .update(eventInvitations)
        .set({
          invitationEmailStatus: 'queued',
          invitationEmailQueuedAt: new Date(),
        })
        .where(
          and(
            eq(eventInvitations.id, candidate.responseId),
            eq(eventInvitations.invitationEmailStatus, 'unsent'),
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
