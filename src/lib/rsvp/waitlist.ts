import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';

import { eventParticipants, events, user } from '@/db/schema';
import { hasStatus } from '@/lib/participation/server';
import { db } from '@/utils/db';

/**
 * The waitlist is the RSVP queue: accepting an application puts it here, and
 * each wave invites from the front (see `selectRsvpWaveInvitees`). This is the
 * one place that reads it in queue order and the one place that reorders it.
 */

export type WaitlistEntry = {
  participantId: string;
  userId: string;
  name: string;
  email: string;
  /** 1-based place in the queue — what the next wave goes by. */
  position: number;
  appliedAt: Date;
};

/**
 * Queue order: `waitlist_position` (unranked last), then oldest application,
 * then id. Must match `selectRsvpWaveInvitees`, so what an organizer sees is
 * exactly who the next wave will invite.
 */
const QUEUE_ORDER = [
  sql`${eventParticipants.waitlistPosition} ASC NULLS LAST`,
  asc(eventParticipants.createdAt),
  asc(eventParticipants.id),
];

export async function getWaitlist(eventId: string): Promise<WaitlistEntry[]> {
  const rows = await db
    .select({
      participantId: eventParticipants.id,
      userId: eventParticipants.userId,
      name: user.name,
      email: user.email,
      appliedAt: eventParticipants.createdAt,
    })
    .from(eventParticipants)
    .innerJoin(user, eq(eventParticipants.userId, user.id))
    .where(and(eq(eventParticipants.eventId, eventId), hasStatus('waitlisted')))
    .orderBy(...QUEUE_ORDER);

  return rows.map((row, index) => ({ ...row, position: index + 1 }));
}

export type MoveWaitlistEntryResult =
  | { success: true; from: number; to: number }
  | { success: false; error: string };

/**
 * Move one waitlisted participant to `toPosition` (1-based, clamped to the
 * queue), shifting everyone between. The whole queue is renumbered 1..n, so
 * unranked entries get a real position the first time anyone is moved.
 *
 * Holds the event row lock, the same lock `sendRsvpWave` takes, so a reorder
 * never interleaves with a wave choosing its invitees.
 */
export async function moveWaitlistEntry(
  eventId: string,
  participantId: string,
  toPosition: number,
): Promise<MoveWaitlistEntryResult> {
  if (!Number.isInteger(toPosition) || toPosition < 1) {
    return {
      success: false,
      error: 'Position must be a whole number of 1 or more.',
    };
  }

  return db.transaction(async (tx) => {
    const [event] = await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId))
      .for('update')
      .limit(1);
    if (!event) return { success: false, error: 'Event not found.' };

    const queue = await tx
      .select({ id: eventParticipants.id })
      .from(eventParticipants)
      .where(
        and(eq(eventParticipants.eventId, eventId), hasStatus('waitlisted')),
      )
      .orderBy(...QUEUE_ORDER)
      .for('update');

    const ids = queue.map((row) => row.id);
    const fromIndex = ids.indexOf(participantId);
    if (fromIndex === -1) {
      return {
        success: false,
        error: 'That participant is no longer on the waitlist.',
      };
    }
    const toIndex = Math.min(toPosition, ids.length) - 1;

    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, participantId);

    const ordered = sql.join(
      ids.map((id, index) => sql`(${id}::uuid, ${index + 1}::integer)`),
      sql`, `,
    );
    await tx.execute(sql`
      UPDATE event_participants AS p
      SET waitlist_position = ordered.position, updated_at = now()
      FROM (VALUES ${ordered}) AS ordered(id, position)
      WHERE p.id = ordered.id
        AND p.waitlist_position IS DISTINCT FROM ordered.position
    `);

    return { success: true, from: fromIndex + 1, to: toIndex + 1 };
  });
}
