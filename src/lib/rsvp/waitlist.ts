import 'server-only';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import {
  applicationVotes,
  eventParticipants,
  events,
  participationStatuses,
  teamMembers,
  user,
} from '@/db/schema';
import {
  orderWaitlist,
  planReviewTransitions,
  type VoteTally,
  type WaitlistCandidate,
} from '@/lib/application-vote-ranking';
import { hasStatus, statusIdOf } from '@/lib/participation/server';
import { resolveStoredStatus } from '@/lib/participation/status';
import { db } from '@/utils/db';

/**
 * The waitlist is the RSVP queue: a yes in the swipe review (or an organizer
 * accepting an application) puts it here, and each wave invites from the
 * front. Its order is never stored — it's derived from the review votes on
 * every read (see `orderWaitlist`), so what an organizer sees and who the
 * next wave invites always come from the same tally.
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Pick<typeof db, 'select'>;

/** Every participant in the event (oldest first) and every vote tally. */
async function loadTallyInputs(
  executor: Executor,
  eventId: string,
): Promise<{
  participants: WaitlistCandidate[];
  tallies: Map<string, VoteTally>;
}> {
  const [participants, voteRows] = await Promise.all([
    executor
      .select({
        participantId: eventParticipants.id,
        teamId: teamMembers.teamId,
        statusLabel: participationStatuses.label,
      })
      .from(eventParticipants)
      .innerJoin(
        participationStatuses,
        eq(eventParticipants.statusId, participationStatuses.id),
      )
      .leftJoin(
        teamMembers,
        and(
          eq(teamMembers.eventId, eventParticipants.eventId),
          eq(teamMembers.userId, eventParticipants.userId),
        ),
      )
      .where(eq(eventParticipants.eventId, eventId))
      .orderBy(asc(eventParticipants.createdAt), asc(eventParticipants.id)),
    executor
      .select({
        participantId: applicationVotes.participantId,
        yes: sql<number>`count(*) FILTER (WHERE ${applicationVotes.approve})`.mapWith(
          Number,
        ),
        no: sql<number>`count(*) FILTER (WHERE NOT ${applicationVotes.approve})`.mapWith(
          Number,
        ),
      })
      .from(applicationVotes)
      .where(eq(applicationVotes.eventId, eventId))
      .groupBy(applicationVotes.participantId),
  ]);

  return {
    participants: participants.map((p) => ({
      participantId: p.participantId,
      teamId: p.teamId,
      status: resolveStoredStatus(p.statusLabel),
    })),
    tallies: new Map(
      voteRows.map((row) => [row.participantId, { yes: row.yes, no: row.no }]),
    ),
  };
}

/** Waitlisted participant ids in queue order — the order waves invite in. */
export async function getWaitlistOrder(
  eventId: string,
  executor: Executor = db,
): Promise<string[]> {
  const { participants, tallies } = await loadTallyInputs(executor, eventId);
  return orderWaitlist(participants, tallies);
}

export async function getWaitlist(eventId: string): Promise<WaitlistEntry[]> {
  const [order, rows] = await Promise.all([
    getWaitlistOrder(eventId),
    db
      .select({
        participantId: eventParticipants.id,
        userId: eventParticipants.userId,
        name: user.name,
        email: user.email,
        appliedAt: eventParticipants.createdAt,
      })
      .from(eventParticipants)
      .innerJoin(user, eq(eventParticipants.userId, user.id))
      .where(
        and(eq(eventParticipants.eventId, eventId), hasStatus('waitlisted')),
      ),
  ]);

  const byId = new Map(rows.map((row) => [row.participantId, row]));
  return order.flatMap((id, index) => {
    const row = byId.get(id);
    return row ? [{ ...row, position: index + 1 }] : [];
  });
}

export type WaitlistSyncResult = {
  /** Moved from `pending_review` onto the waitlist. */
  promoted: string[];
  /** Sent back from the waitlist to `pending_review`. */
  demoted: string[];
};

/**
 * Apply the status changes the tally implies (see `planReviewTransitions`):
 * promote applicants whose team has earned a yes, and demote a group that
 * just lost its last one (`demoteGroupOf`). Order needs no write — it's
 * derived on read.
 *
 * The caller must hold the event row lock — the same lock `sendRsvpWave`
 * takes — so a sync never interleaves with a wave inviting from the list.
 */
export async function syncWaitlist(
  tx: Tx,
  eventId: string,
  options: { actorId?: string | null; demoteGroupOf?: string } = {},
): Promise<WaitlistSyncResult> {
  const { participants, tallies } = await loadTallyInputs(tx, eventId);
  const { promote, demote } = planReviewTransitions(participants, tallies, {
    demoteGroupOf: options.demoteGroupOf,
  });

  const reviewed = {
    reviewedAt: new Date(),
    reviewedBy: options.actorId ?? null,
  };
  if (promote.length > 0) {
    await tx
      .update(eventParticipants)
      .set({ statusId: statusIdOf('waitlisted'), ...reviewed })
      .where(
        and(
          inArray(eventParticipants.id, promote),
          hasStatus('pending_review'),
        ),
      );
  }
  if (demote.length > 0) {
    await tx
      .update(eventParticipants)
      .set({ statusId: statusIdOf('pending_review'), ...reviewed })
      .where(
        and(inArray(eventParticipants.id, demote), hasStatus('waitlisted')),
      );
  }

  return { promoted: promote, demoted: demote };
}

/**
 * `syncWaitlist` in its own transaction, for changes that move the tally's
 * inputs without casting a vote — a team joined or left, an applicant marked
 * "Denied". Takes the event lock itself.
 */
export async function syncWaitlistForEvent(
  eventId: string,
  actorId: string | null = null,
): Promise<WaitlistSyncResult> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId))
      .for('update');
    return syncWaitlist(tx, eventId, { actorId });
  });
}
