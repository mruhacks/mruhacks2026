import 'server-only';

import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';

import {
  eventRsvpResponses,
  eventRsvpWaves,
  rsvpStatuses,
} from '@/db/schema';
import { db } from '@/utils/db';

const PENDING_RSVP_STATUS_LABEL = 'pending';
const TIMED_OUT_RSVP_STATUS_LABEL = 'timed_out';

export type TimeoutExpiredRsvpOptions = {
  /** Limit to one event (display / submit path). */
  eventId?: string;
  /** Limit to one user (display / submit path). */
  userId?: string;
  /** Clock override for tests. Defaults to now. */
  now?: Date;
};

export type TimeoutExpiredRsvpResult = {
  timedOutCount: number;
};

/**
 * Marks pending RSVP responses as `timed_out` when their wave `respond_by`
 * is in the past. Safe for cron (no filters) or scoped to event/user.
 *
 * Does not touch accepted/declined rows and does not set `responded_at`
 * (that field is reserved for an explicit user response).
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
    isNotNull(eventRsvpWaves.respondBy),
    lt(eventRsvpWaves.respondBy, now),
  ];

  if (options.eventId) {
    filters.push(eq(eventRsvpWaves.eventId, options.eventId));
  }
  if (options.userId) {
    filters.push(eq(eventRsvpResponses.userId, options.userId));
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
