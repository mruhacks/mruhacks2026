'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';

import {
  eventApplicationsCacheTag,
  getEventQuestions,
} from '@/lib/admin-event';
import {
  castApplicationVote,
  getReviewQueue,
  retractApplicationVote,
  type ReviewCard,
} from '@/lib/application-votes';
import { hasPermission } from '@/lib/rbac/authorization';
import type { ParticipationStatus } from '@/types/lookups';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { writeAuditLog } from '@/utils/audit-log';
import { getUser } from '@/utils/auth';

/** Cards fetched per round trip; the client refills when it runs low. */
const QUEUE_BATCH = 10;

const voteSchema = z.object({
  eventId: z.uuid(),
  participantId: z.uuid(),
  approve: z.boolean(),
});

const retractSchema = voteSchema.omit({ approve: true });

async function getVoter() {
  const user = await getUser();
  if (!user) return null;
  if (!(await hasPermission(user.id, 'application:vote:all'))) return null;
  return user;
}

export type ReviewQueue = {
  cards: ReviewCard[];
  remaining: number;
  reviewed: number;
};

/**
 * Admin: the next applications this reviewer hasn't voted on, excluding
 * `skip` — cards the client already holds, so a refill doesn't duplicate
 * them while their votes are still in flight.
 */
export async function getApplicationReviewQueue(input: {
  eventId: string;
  skip?: string[];
}): Promise<ActionResult<ReviewQueue>> {
  const voter = await getVoter();
  if (!voter) return fail("You don't have permission to review applications.");
  const eventId = z.uuid().safeParse(input.eventId);
  if (!eventId.success) return fail('Invalid event.');

  const skip = new Set(input.skip ?? []);
  const queue = await getReviewQueue({
    eventId: eventId.data,
    voterId: voter.id,
    questions: await getEventQuestions(eventId.data),
    limit: QUEUE_BATCH + skip.size,
  });
  return ok({
    ...queue,
    cards: queue.cards
      .filter((card) => !skip.has(card.participantId))
      .slice(0, QUEUE_BATCH),
  });
}

/** Admin: vote yes/no on one application from the swipe review. */
export async function voteOnApplication(
  input: z.input<typeof voteSchema>,
): Promise<ActionResult<{ status: ParticipationStatus }>> {
  const voter = await getVoter();
  if (!voter) return fail("You don't have permission to review applications.");
  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) return fail('Invalid vote.');

  let result;
  try {
    result = await castApplicationVote({ ...parsed.data, voterId: voter.id });
  } catch (error) {
    console.error('[admin/events/review] Application vote error:', error);
    return fail('Failed to record your vote.');
  }
  if (!result.success) return fail(result.error);

  updateTag(eventApplicationsCacheTag(parsed.data.eventId));
  await writeAuditLog({
    actorId: voter.id,
    action: 'event.application_voted',
    targetType: 'event_participant',
    targetId: parsed.data.participantId,
    metadata: {
      eventId: parsed.data.eventId,
      approve: parsed.data.approve,
      status: result.status,
    },
  });
  return ok({ status: result.status });
}

/** Admin: undo this reviewer's vote on one application. */
export async function undoApplicationVote(
  input: z.input<typeof retractSchema>,
): Promise<ActionResult<{ status: ParticipationStatus }>> {
  const voter = await getVoter();
  if (!voter) return fail("You don't have permission to review applications.");
  const parsed = retractSchema.safeParse(input);
  if (!parsed.success) return fail('Invalid request.');

  let result;
  try {
    result = await retractApplicationVote({
      ...parsed.data,
      voterId: voter.id,
    });
  } catch (error) {
    console.error('[admin/events/review] Application vote undo error:', error);
    return fail('Failed to undo your vote.');
  }
  if (!result.success) return fail(result.error);

  updateTag(eventApplicationsCacheTag(parsed.data.eventId));
  await writeAuditLog({
    actorId: voter.id,
    action: 'event.application_vote_retracted',
    targetType: 'event_participant',
    targetId: parsed.data.participantId,
    metadata: { eventId: parsed.data.eventId, status: result.status },
  });
  return ok({ status: result.status });
}
