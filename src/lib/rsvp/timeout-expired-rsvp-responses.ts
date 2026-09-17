import 'server-only';

import { and, eq, inArray, lt } from 'drizzle-orm';

import { eventRsvpResponses, eventRsvpWaves, rsvpStatuses } from '@/db/schema';
import { db } from '@/utils/db';

const PENDING_RSVP_STATUS_LABEL = 'pending';
const TIMED_OUT_RSVP_STATUS_LABEL = 'timed_out';

export type TimeoutExpiredRsvpOptions = {
  /** Limit to one event (wave send). */
  eventId?: string;
  /** Clock override for tests. Defaults to now. */
  now?: Date;
};

export type TimeoutExpiredRsvpResult = {
  timedOutCount: number;
};

/**
 * Marks pending RSVP responses as `timed_out` when their wave `respond_by`
 * is in the past. Persistence helper for cron and wave send — reads must
 * not depend on this. Effective status is derived in
 * `resolveEffectiveRsvpStatus`.
 *
 * Idempotent: already-timed-out rows are not selected again.
 * Does not touch accepted/declined rows and does not set `responded_at`.
 */
export async function timeoutExpiredRsvpResponses(
  options: TimeoutExpiredRsvpOptions = {},
): Promise<TimeoutExpiredRsvpResult> {
  const now = options.now ?? new Date();

  const [timedOutStatus] = await db
    .select({ id: rsvpStatuses.id })
    .from(rsvpStatuses)
    .where(eq(rsvpStatuses.label, TIMED_OUT_RSVP_STATUS_LABEL))
    .limit(1);

  if (!timedOutStatus) {
    throw new Error('RSVP statuses are not configured (missing timed_out).');
  }

  const [pendingStatus] = await db
    .select({ id: rsvpStatuses.id })
    .from(rsvpStatuses)
    .where(eq(rsvpStatuses.label, PENDING_RSVP_STATUS_LABEL))
    .limit(1);

  if (!pendingStatus) {
    throw new Error('RSVP statuses are not configured (missing pending).');
  }

  const filters = [
    eq(eventRsvpResponses.statusId, pendingStatus.id),
    lt(eventRsvpWaves.respondBy, now),
  ];

  if (options.eventId) {
    filters.push(eq(eventRsvpWaves.eventId, options.eventId));
  }

  const expired = await db
    .select({ id: eventRsvpResponses.id })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .where(and(...filters));

  if (expired.length === 0) {
    return { timedOutCount: 0 };
  }

  await db
    .update(eventRsvpResponses)
    .set({ statusId: timedOutStatus.id })
    .where(
      inArray(
        eventRsvpResponses.id,
        expired.map((row) => row.id),
      ),
    );

  return { timedOutCount: expired.length };
}
