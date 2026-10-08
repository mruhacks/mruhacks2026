/**
 * Server actions for the judge flow at /dashboard/events/:eventId/judge.
 *
 * Begin, vote and skip are plain form actions: each moves the judge along,
 * then `refresh()`es so the judge page re-renders wherever the server sent
 * them. A form submitted from a stale screen (another tab moved on) changes
 * nothing and just shows where the judge really is. Authorization and
 * locking live in `@/lib/judging/judge-session`.
 */

'use server';

import { and, eq } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { z } from 'zod';

import { judgeNotes, judgeSkips, submissions } from '@/db/schema';
import {
  advance,
  loadJudgeContext,
  lockState,
  poolMembers,
  settleAssignment,
} from '@/lib/judging/judge-session';
import { JUDGE_NOTE_MAX_LENGTH } from '@/lib/judging/limits';
import {
  findJudgeForUser,
  loadCriteria,
  lockCriteriaShared,
  recordComparison,
} from '@/lib/judging/server';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';

const idSchema = z.uuid();

/** Begin: the first project becomes what the next one is compared against. */
export async function beginJudging(
  eventId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(formData.get('currentId'));
  if (!parsed.success) return fail('Invalid project.');
  const currentId = parsed.data;
  const ctx = await loadJudgeContext(eventId);

  if (ctx.ok) {
    await db.transaction(async (tx) => {
      const settled = await settleAssignment(tx, ctx);
      if (settled.previousId !== null || settled.currentId !== currentId) {
        return;
      }
      await advance(tx, ctx, currentId, currentId);
    });
  }
  refresh();
  return ok();
}

/** Each criterion's pick arrives as a `winner:<criterionId>` field. */
const WINNER_PREFIX = 'winner:';

const voteSchema = z.object({
  previousId: z.uuid(),
  currentId: z.uuid(),
  /** criterion id → which project was better on it. */
  winners: z.record(z.uuid(), z.enum(['previous', 'current'])),
});

/**
 * Previous or Current, for every criterion; then on to the next table. A
 * project that left the pool mid-visit is ignored, as in Gavel: no votes are
 * recorded, but the judge still moves on.
 */
export async function submitJudgeVote(
  eventId: string,
  formData: FormData,
): Promise<ActionResult> {
  const winners: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData) {
    if (key.startsWith(WINNER_PREFIX)) {
      winners[key.slice(WINNER_PREFIX.length)] = value;
    }
  }
  const parsed = voteSchema.safeParse({
    previousId: formData.get('previousId'),
    currentId: formData.get('currentId'),
    winners,
  });
  if (!parsed.success) return fail('Invalid vote.');
  const { previousId, currentId } = parsed.data;

  const ctx = await loadJudgeContext(eventId);
  if (!ctx.ok) {
    refresh();
    return ok();
  }

  const outcome = await db.transaction(async (tx) => {
    // Shared lock on the event row: votes don't wait on each other, but a
    // criteria save (FOR UPDATE) can't add or remove a criterion between
    // reading the criteria here and recording a vote on each of them.
    await lockCriteriaShared(tx, eventId);
    const criteria = await loadCriteria(eventId, tx);
    // All removed since the form was rendered: the refresh shows why.
    if (criteria.length === 0) return ok();
    const choices = new Map<string, 'previous' | 'current'>();
    for (const criterion of criteria) {
      const choice = parsed.data.winners[criterion.id];
      if (!choice) return fail(`Pick a project for “${criterion.name}”.`);
      choices.set(criterion.id, choice);
    }

    const state = await lockState(tx, ctx.judge.id);
    if (
      state.previousSubmissionId !== previousId ||
      state.currentSubmissionId !== currentId
    ) {
      return ok();
    }

    const active = await poolMembers(tx, eventId, [previousId, currentId]);
    if (active.has(previousId) && active.has(currentId)) {
      await recordComparison(tx, {
        judgeId: ctx.judge.id,
        previousId,
        currentId,
        winners: choices,
      });
    }
    await advance(tx, ctx, currentId, currentId);
    return ok();
  });
  // Also on failure: a criterion added since the form was rendered shows up
  // once the page refreshes, next to the error asking for it.
  refresh();
  return outcome;
}

const skipSchema = z.object({
  currentId: z.uuid(),
  reason: z.enum(['not_here', 'conflict']),
});

/**
 * Skip the current project. "Team not here" may come back to this judge
 * later; "Conflict of interest" never does. Either way the project they're
 * comparing against stays the same.
 */
export async function skipJudgeProject(
  eventId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = skipSchema.safeParse({
    currentId: formData.get('currentId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return fail('Invalid skip.');
  const { currentId, reason } = parsed.data;

  const ctx = await loadJudgeContext(eventId);
  if (ctx.ok) {
    await db.transaction(async (tx) => {
      const settled = await settleAssignment(tx, ctx);
      if (settled.currentId !== currentId) return;

      await tx
        .insert(judgeSkips)
        .values({ judgeId: ctx.judge.id, submissionId: currentId, reason });
      await advance(tx, ctx, settled.previousId, currentId);
    });
  }
  refresh();
  return ok();
}

const noteSchema = z.object({
  submissionId: z.uuid(),
  body: z
    .string()
    .max(
      JUDGE_NOTE_MAX_LENGTH,
      `Keep notes under ${JUDGE_NOTE_MAX_LENGTH} characters.`,
    ),
});

/**
 * A judge's private note on a project — only ever shown back to them. Kept
 * per user, so it goes with their account. An empty note is deleted.
 */
export async function saveJudgeNote(
  eventId: string,
  input: z.infer<typeof noteSchema>,
): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid note.');
  }
  const { submissionId, body } = parsed.data;

  const user = await getUser();
  if (!user) return fail('Not authenticated');
  const judge = await findJudgeForUser(eventId, user);
  if (!judge || judge.disabledAt)
    return fail('You are not judging this event.');

  const [submission] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(eq(submissions.id, submissionId), eq(submissions.eventId, eventId)),
    )
    .limit(1);
  if (!submission) return fail('Project not found.');

  try {
    if (body.trim() === '') {
      await db
        .delete(judgeNotes)
        .where(
          and(
            eq(judgeNotes.userId, user.id),
            eq(judgeNotes.submissionId, submissionId),
          ),
        );
    } else {
      await db
        .insert(judgeNotes)
        .values({ userId: user.id, submissionId, body })
        .onConflictDoUpdate({
          target: [judgeNotes.userId, judgeNotes.submissionId],
          set: { body, updatedAt: new Date() },
        });
    }
    return ok();
  } catch (error) {
    console.error('[saveJudgeNote] failed', error);
    return fail('Failed to save your note.');
  }
}
