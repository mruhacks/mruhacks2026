import 'server-only';

import { and, asc, count, eq, ne, notExists, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import * as Participation from '@/lib/participation/server';
import * as Rsvp from '@/lib/rsvp/server';
import { otherTextKey } from '@/lib/other-option';
import { resolveShowInApplicationReview, type ApplicationQuestion } from '@/types/application';
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
const VOTABLE_STATUSES = ['pending_review', 'waitlisted'] as const satisfies readonly ParticipationStatus[];

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
export function reviewQuestions(questions: readonly ApplicationQuestion[]): ApplicationQuestion[] {
  return questions
    .filter((q) => q.active && q.type !== 'section_divider' && resolveShowInApplicationReview(q))
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
      .select({ id: schema.applicationVotes.id })
      .from(schema.applicationVotes)
      .where(
        and(
          eq(schema.applicationVotes.participantId, schema.eventParticipants.id),
          eq(schema.applicationVotes.voterId, input.voterId),
        ),
      ),
  );
  const pool = and(
    eq(schema.eventParticipants.eventId, input.eventId),
    ne(schema.eventParticipants.userId, input.voterId),
    Participation.hasAnyStatus(VOTABLE_STATUSES),
  );
  const voteCount = db
    .select({ n: count() })
    .from(schema.applicationVotes)
    .where(eq(schema.applicationVotes.participantId, schema.eventParticipants.id));

  const [rows, [{ remaining }], [{ reviewed }]] = await Promise.all([
    db
      .select({
        participantId: schema.eventParticipants.id,
        responses: schema.eventParticipants.responses,
      })
      .from(schema.eventParticipants)
      .where(and(pool, notVotedByMe))
      .orderBy(sql`(${voteCount}) ASC`, asc(schema.eventParticipants.createdAt), asc(schema.eventParticipants.id))
      .limit(input.limit),
    db.select({ remaining: count() }).from(schema.eventParticipants).where(and(pool, notVotedByMe)),
    db
      .select({ reviewed: count() })
      .from(schema.applicationVotes)
      .where(
        and(eq(schema.applicationVotes.eventId, input.eventId), eq(schema.applicationVotes.voterId, input.voterId)),
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

export type VoteResult = { success: true; status: ParticipationStatus } | { success: false; error: string };

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
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .for('update')
    .limit(1);
  if (!event) return { error: 'Event not found.' };

  const [row] = await tx
    .select({
      userId: schema.eventParticipants.userId,
      statusLabel: schema.participationStatuses.label,
    })
    .from(schema.eventParticipants)
    .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
    .where(and(eq(schema.eventParticipants.id, participantId), eq(schema.eventParticipants.eventId, eventId)))
    .for('update', { of: schema.eventParticipants })
    .limit(1);
  if (!row) return { error: 'Application not found.' };
  if (row.userId === voterId) {
    return { error: "You can't review your own application." };
  }

  const status = Participation.resolveStoredStatus(row.statusLabel);
  if (!(VOTABLE_STATUSES as readonly string[]).includes(status)) {
    return { error: 'This application has already been decided.' };
  }
  return { status };
}

function statusAfter(
  before: ParticipationStatus,
  participantId: string,
  sync: Rsvp.WaitlistSyncResult,
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
    const locked = await lockVotable(tx, input.eventId, input.participantId, input.voterId);
    if ('error' in locked) return { success: false, error: locked.error };

    const [previous] = await tx
      .select({ approve: schema.applicationVotes.approve })
      .from(schema.applicationVotes)
      .where(
        and(
          eq(schema.applicationVotes.participantId, input.participantId),
          eq(schema.applicationVotes.voterId, input.voterId),
        ),
      )
      .limit(1);

    await tx
      .insert(schema.applicationVotes)
      .values({
        participantId: input.participantId,
        eventId: input.eventId,
        voterId: input.voterId,
        approve: input.approve,
      })
      .onConflictDoUpdate({
        target: [schema.applicationVotes.participantId, schema.applicationVotes.voterId],
        set: { approve: input.approve, updatedAt: new Date() },
      });

    // Flipping a yes to a no may leave the applicant's group with none.
    const lostYes = previous?.approve === true && !input.approve;
    const sync = await Rsvp.syncWaitlist(tx, input.eventId, {
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
    const locked = await lockVotable(tx, input.eventId, input.participantId, input.voterId);
    if ('error' in locked) return { success: false, error: locked.error };

    const [removed] = await tx
      .delete(schema.applicationVotes)
      .where(
        and(
          eq(schema.applicationVotes.participantId, input.participantId),
          eq(schema.applicationVotes.voterId, input.voterId),
        ),
      )
      .returning({ approve: schema.applicationVotes.approve });
    if (!removed) {
      return { success: false, error: 'There is no vote to undo.' };
    }

    const sync = await Rsvp.syncWaitlist(tx, input.eventId, {
      actorId: input.voterId,
      demoteGroupOf: removed.approve ? input.participantId : undefined,
    });
    return {
      success: true,
      status: statusAfter(locked.status, input.participantId, sync),
    };
  });
}
