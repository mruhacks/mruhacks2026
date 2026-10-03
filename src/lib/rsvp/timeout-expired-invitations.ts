import 'server-only';

import { and, eq, inArray, lt } from 'drizzle-orm';

import {
  eventInvitations,
  eventParticipants,
  eventRsvpWaves,
} from '@/db/schema';
import { hasStatus, statusIdOf } from '@/lib/participation/server';
import { db } from '@/utils/db';

export type TimeoutExpiredInvitationsOptions = {
  /** Limit to one event (wave send). */
  eventId?: string;
  /** Clock override for tests. Defaults to now. */
  now?: Date;
};

export type TimeoutExpiredInvitationsResult = {
  timedOutCount: number;
};

/**
 * Persists `invited` → `timed_out` for participants whose invitation deadline
 * has passed. A persistence helper for cron and wave send — reads must not
 * depend on it; `resolveEffectiveStatus` already reads an expired invitation
 * as timed out.
 *
 * Idempotent, and the update is a compare-and-set on `invited`, so an accept
 * racing the sweep can't be overwritten.
 */
export async function timeoutExpiredInvitations(
  options: TimeoutExpiredInvitationsOptions = {},
): Promise<TimeoutExpiredInvitationsResult> {
  const now = options.now ?? new Date();

  const filters = [hasStatus('invited'), lt(eventRsvpWaves.respondBy, now)];
  if (options.eventId) {
    filters.push(eq(eventParticipants.eventId, options.eventId));
  }

  const expired = await db
    .select({ id: eventParticipants.id })
    .from(eventParticipants)
    .innerJoin(
      eventInvitations,
      eq(eventInvitations.participantId, eventParticipants.id),
    )
    .innerJoin(
      eventRsvpWaves,
      eq(eventInvitations.rsvpWaveId, eventRsvpWaves.id),
    )
    .where(and(...filters));

  if (expired.length === 0) {
    return { timedOutCount: 0 };
  }

  const updated = await db
    .update(eventParticipants)
    .set({ statusId: statusIdOf('timed_out') })
    .where(
      and(
        inArray(
          eventParticipants.id,
          expired.map((row) => row.id),
        ),
        hasStatus('invited'),
      ),
    )
    .returning({ id: eventParticipants.id });

  return { timedOutCount: updated.length };
}
