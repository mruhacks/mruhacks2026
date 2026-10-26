import 'server-only';

import { and, eq, inArray, lt } from 'drizzle-orm';

import * as schema from '@/db/schema';
import * as Participation from '@/lib/participation/server';
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

  const filters = [Participation.hasStatus('invited'), lt(schema.eventRsvpWaves.respondBy, now)];
  if (options.eventId) {
    filters.push(eq(schema.eventParticipants.eventId, options.eventId));
  }

  const expired = await db
    .select({ id: schema.eventParticipants.id })
    .from(schema.eventParticipants)
    .innerJoin(schema.eventInvitations, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
    .innerJoin(schema.eventRsvpWaves, eq(schema.eventInvitations.rsvpWaveId, schema.eventRsvpWaves.id))
    .where(and(...filters));

  if (expired.length === 0) {
    return { timedOutCount: 0 };
  }

  const updated = await db
    .update(schema.eventParticipants)
    .set({ statusId: Participation.statusIdOf('timed_out') })
    .where(
      and(
        inArray(
          schema.eventParticipants.id,
          expired.map((row) => row.id),
        ),
        Participation.hasStatus('invited'),
      ),
    )
    .returning({ id: schema.eventParticipants.id });

  return { timedOutCount: updated.length };
}
