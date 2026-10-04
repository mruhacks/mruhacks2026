import 'server-only';

import { and, asc, count, eq, ne, notExists, sql } from 'drizzle-orm';

import {
  applicationVotes,
  eventParticipants,
  events,
  participationStatuses,
} from '@/db/schema';
import { hasAnyStatus } from '@/lib/participation/server';
import { resolveStoredStatus } from '@/lib/participation/status';
import { syncWaitlist, type WaitlistSyncResult } from '@/lib/rsvp/waitlist';
import { otherTextKey } from '@/lib/other-option';
import {
  resolveShowInApplicationReview,
  type ApplicationQuestion,
} from '@/types/application';
import type { ParticipationStatus } from '@/types/lookups';
import { db } from '@/utils/db';

/**
 * Blind swipe review: reviewers vote yes/no on applications seeing only the
 * questions tagged "show in application review" — no name, email or profile.
 *
 * - The first yes moves a `pending_review` applicant — and their teammates,
 *   unless marked "Denied" — onto the waitlist.
 * - Every vote re-ranks the waitlist by Wilson score, a team by its best
 *   member (see `@/lib/application-vote-ranking`).
 * - Only applicants still in review (`pending_review` / `waitlisted`) can be
 *   voted on; once invited or denied, the tally no longer moves them.
 */

/** Statuses the swipe review deals with; everything else is already decided. */
const VOTABLE_STATUSES = [
  'pending_review',
  'waitlisted',
] as const satisfies readonly ParticipationStatus[];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ReviewAnswer = {
  questionId: string;
  label: string;
  description?: string;
  type: ApplicationQuestion['type'];
  options?: ApplicationQuestion['options'];
  value: unknown;
  otherText?: unknown;
};

export type ReviewCard = {
  participantId: string;
  answers: ReviewAnswer[];
};

/** The questions a reviewer is allowed to see, in form order. */
export function reviewQuestions(
  questions: readonly ApplicationQuestion[],
): ApplicationQuestion[] {
  return questions
    .filter(
      (q) =>
        q.active &&
        q.type !== 'section_divider' &&
        resolveShowInApplicationReview(q),
    )
    .sort((a, b) => a.order - b.order);
}

/**
 * Strip a stored response down to review-tagged answers. Done server-side so
 * nothing else in the application ever reaches the reviewer's browser.
 */
function toReviewAnswers(
  questions: readonly ApplicationQuestion[],
  responses: Record<string, unknown> | null,
): ReviewAnswer[] {
  return questions.map((q) => ({
    questionId: q.id,
    label: q.label,
    description: q.description,
    type: q.type,
    options: q.options,
    value: responses?.[q.id] ?? null,
    otherText: responses?.[otherTextKey(q.id)],
  }));
}

/**
 * The next applications `voterId` hasn't voted on yet. Least-voted first, so
 * the reviewer pool spreads its attention before doubling up, then oldest.
 * A reviewer never sees their own application.
 */
export async function getReviewQueue(input: {
  eventId: string;
  voterId: string;
  questions: readonly ApplicationQuestion[];
  limit: number;
}): Promise<{ cards: ReviewCard[]; remaining: number; reviewed: number }> {
  const notVotedByMe = notExists(
    db
      .select({ id: applicationVotes.id })
      .from(applicationVotes)
      .where(
        and(
          eq(applicationVotes.participantId, eventParticipants.id),
          eq(applicationVotes.voterId, input.voterId),
        ),
      ),
  );
  const pool = and(
    eq(eventParticipants.eventId, input.eventId),
    ne(eventParticipants.userId, input.voterId),
    hasAnyStatus(VOTABLE_STATUSES),
  );
  const voteCount = db
    .select({ n: count() })
    .from(applicationVotes)
    .where(eq(applicationVotes.participantId, eventParticipants.id));

  const [rows, [{ remaining }], [{ reviewed }]] = await Promise.all([
    db
      .select({
        participantId: eventParticipants.id,
        responses: eventParticipants.responses,
      })
      .from(eventParticipants)
      .where(and(pool, notVotedByMe))
      .orderBy(
        sql`(${voteCount}) ASC`,
        asc(eventParticipants.createdAt),
        asc(eventParticipants.id),
      )
      .limit(input.limit),
    db
      .select({ remaining: count() })
      .from(eventParticipants)
      .where(and(pool, notVotedByMe)),
    db
      .select({ reviewed: count() })
      .from(applicationVotes)
      .where(
        and(
          eq(applicationVotes.eventId, input.eventId),
          eq(applicationVotes.voterId, input.voterId),
        ),
      ),
  ]);

  const shown = reviewQuestions(input.questions);
  return {
    cards: rows.map((row) => ({
      participantId: row.participantId,
      answers: toReviewAnswers(shown, row.responses),
    })),
    remaining,
    reviewed,
  };
}

export type VoteResult =
  | { success: true; status: ParticipationStatus }
  | { success: false; error: string };

/**
 * Lock the event (same lock order as `sendRsvpWave`: event, then
 * participant) and the participant, and return the participant's status if
 * they can still be voted on.
 */
async function lockVotable(
  tx: Tx,
  eventId: string,
  participantId: string,
  voterId: string,
): Promise<{ status: ParticipationStatus } | { error: string }> {
  const [event] = await tx
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .for('update')
    .limit(1);
  if (!event) return { error: 'Event not found.' };

  const [row] = await tx
    .select({
      userId: eventParticipants.userId,
      statusLabel: participationStatuses.label,
    })
    .from(eventParticipants)
    .innerJoin(
      participationStatuses,
      eq(eventParticipants.statusId, participationStatuses.id),
    )
    .where(
      and(
        eq(eventParticipants.id, participantId),
        eq(eventParticipants.eventId, eventId),
      ),
    )
    .for('update', { of: eventParticipants })
    .limit(1);
  if (!row) return { error: 'Application not found.' };
  if (row.userId === voterId) {
    return { error: "You can't review your own application." };
  }

  const status = resolveStoredStatus(row.statusLabel);
  if (!(VOTABLE_STATUSES as readonly string[]).includes(status)) {
    return { error: 'This application has already been decided.' };
  }
  return { status };
}

function statusAfter(
  before: ParticipationStatus,
  participantId: string,
  sync: WaitlistSyncResult,
): ParticipationStatus {
  if (sync.promoted.includes(participantId)) return 'waitlisted';
  if (sync.demoted.includes(participantId)) return 'pending_review';
  return before;
}

/**
 * Record (or change) `voterId`'s vote on one application, then sync the
 * waitlist: a first yes brings the applicant and their team onto it, and
 * every vote re-ranks it.
 */
export async function castApplicationVote(input: {
  eventId: string;
  participantId: string;
  voterId: string;
  approve: boolean;
}): Promise<VoteResult> {
  return db.transaction(async (tx) => {
    const locked = await lockVotable(
      tx,
      input.eventId,
      input.participantId,
      input.voterId,
    );
    if ('error' in locked) return { success: false, error: locked.error };

    const [previous] = await tx
      .select({ approve: applicationVotes.approve })
      .from(applicationVotes)
      .where(
        and(
          eq(applicationVotes.participantId, input.participantId),
          eq(applicationVotes.voterId, input.voterId),
        ),
      )
      .limit(1);

    await tx
      .insert(applicationVotes)
      .values({
        participantId: input.participantId,
        eventId: input.eventId,
        voterId: input.voterId,
        approve: input.approve,
      })
      .onConflictDoUpdate({
        target: [applicationVotes.participantId, applicationVotes.voterId],
        set: { approve: input.approve, updatedAt: new Date() },
      });

    // Flipping a yes to a no may leave the applicant's group with none.
    const lostYes = previous?.approve === true && !input.approve;
    const sync = await syncWaitlist(tx, input.eventId, {
      actorId: input.voterId,
      demoteGroupOf: lostYes ? input.participantId : undefined,
    });
    return {
      success: true,
      status: statusAfter(locked.status, input.participantId, sync),
    };
  });
}

/**
 * Take back `voterId`'s vote on one application (the review screen's undo).
 * Removing the last yes in the applicant's team returns its waitlisted
 * members to `pending_review`.
 */
export async function retractApplicationVote(input: {
  eventId: string;
  participantId: string;
  voterId: string;
}): Promise<VoteResult> {
  return db.transaction(async (tx) => {
    const locked = await lockVotable(
      tx,
      input.eventId,
      input.participantId,
      input.voterId,
    );
    if ('error' in locked) return { success: false, error: locked.error };

    const [removed] = await tx
      .delete(applicationVotes)
      .where(
        and(
          eq(applicationVotes.participantId, input.participantId),
          eq(applicationVotes.voterId, input.voterId),
        ),
      )
      .returning({ approve: applicationVotes.approve });
    if (!removed) {
      return { success: false, error: 'There is no vote to undo.' };
    }

    const sync = await syncWaitlist(tx, input.eventId, {
      actorId: input.voterId,
      demoteGroupOf: removed.approve ? input.participantId : undefined,
    });
    return {
      success: true,
      status: statusAfter(locked.status, input.participantId, sync),
    };
  });
}
