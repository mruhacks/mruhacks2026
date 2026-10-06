/**
 * Server actions for the phone-first judge flow at /judge/:eventId.
 *
 * Judges are authorized by roster membership — a non-disabled `event_judges`
 * row for the event matched to the signed-in user — never by a permission or
 * the `judge` role, the same way team membership authorizes participants.
 *
 * Every action returns the judge's whole next screen (`JudgeView`), so the
 * client never has to guess where the judge goes after a vote or a skip.
 * Each one locks the judge's `judge_state` row, so a double-tapped button or
 * a second open tab can't record a comparison twice: the client sends back
 * the ids it was shown, and a mismatch just returns the current screen.
 */

'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import {
  events,
  judgeNotes,
  judgeSkips,
  judgeState,
  submissions,
} from '@/db/schema';
import {
  dispatchNext,
  findJudgeForUser,
  getJudgingWindow,
  getTableNumbers,
  inPoolCondition,
  loadCriteria,
  recordComparison,
  type JudgeRow,
} from '@/lib/judging/server';
import { JUDGE_NOTE_MAX_LENGTH } from '@/lib/judging/limits';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';

export type JudgeProjectCard = {
  id: string;
  title: string;
  tableNumber: number;
  /** The judge's own private note; empty when they haven't written one. */
  note: string;
};

type JudgeCriterion = { id: string; name: string; description: string };

export type JudgeView =
  | { kind: 'not_judge' }
  | { kind: 'disabled'; eventName: string }
  | { kind: 'not_open'; eventName: string; opensAt: Date | null }
  | { kind: 'closed'; eventName: string }
  | { kind: 'no_criteria'; eventName: string }
  /** On the roster and inside the window, but nowhere left to send them. */
  | { kind: 'waiting'; eventName: string }
  /** The first project: Begin, no vote. */
  | { kind: 'begin'; eventName: string; current: JudgeProjectCard }
  | {
      kind: 'compare';
      eventName: string;
      previous: JudgeProjectCard;
      current: JudgeProjectCard;
      criteria: JudgeCriterion[];
    };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type JudgeContext =
  | { ok: false; view: JudgeView }
  | {
      ok: true;
      userId: string;
      judge: JudgeRow;
      eventId: string;
      eventName: string;
    };

/** Who's asking, and whether they may judge this event right now. */
async function loadJudgeContext(eventId: string): Promise<JudgeContext> {
  const user = await getUser();
  if (!user) return { ok: false, view: { kind: 'not_judge' } };

  const [event] = await db
    .select({
      name: events.name,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return { ok: false, view: { kind: 'not_judge' } };

  const judge = await findJudgeForUser(eventId, user);
  if (!judge) return { ok: false, view: { kind: 'not_judge' } };
  if (judge.disabledAt) {
    return { ok: false, view: { kind: 'disabled', eventName: event.name } };
  }

  const window = getJudgingWindow(event);
  if (window === 'not_open') {
    return {
      ok: false,
      view: {
        kind: 'not_open',
        eventName: event.name,
        opensAt: event.startsAt,
      },
    };
  }
  if (window === 'closed') {
    return { ok: false, view: { kind: 'closed', eventName: event.name } };
  }

  const criteria = await loadCriteria(eventId);
  if (criteria.length === 0) {
    return { ok: false, view: { kind: 'no_criteria', eventName: event.name } };
  }

  return {
    ok: true,
    userId: user.id,
    judge,
    eventId,
    eventName: event.name,
  };
}

/** Creates the judge's state row on first use, then locks it. */
async function lockState(tx: Tx, judgeId: string) {
  await tx.insert(judgeState).values({ judgeId }).onConflictDoNothing();
  const [state] = await tx
    .select()
    .from(judgeState)
    .where(eq(judgeState.judgeId, judgeId))
    .for('update');
  return state!;
}

async function poolMembers(
  tx: Tx,
  eventId: string,
  ids: (string | null)[],
): Promise<Set<string>> {
  const wanted = ids.filter((id): id is string => id != null);
  if (wanted.length === 0) return new Set();
  const rows = await tx
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.eventId, eventId),
        inArray(submissions.id, wanted),
        inPoolCondition(),
      ),
    );
  return new Set(rows.map((row) => row.id));
}

/**
 * Brings the judge's assignment up to date: a previous project that left the
 * pool is dropped (they'll Begin again from the current one), and a missing
 * or departed current project is replaced by a fresh dispatch.
 */
async function settleAssignment(
  tx: Tx,
  ctx: Extract<JudgeContext, { ok: true }>,
): Promise<{ previousId: string | null; currentId: string | null }> {
  const state = await lockState(tx, ctx.judge.id);
  const active = await poolMembers(tx, ctx.eventId, [
    state.previousSubmissionId,
    state.currentSubmissionId,
  ]);
  let previousId =
    state.previousSubmissionId && active.has(state.previousSubmissionId)
      ? state.previousSubmissionId
      : null;
  let currentId =
    state.currentSubmissionId && active.has(state.currentSubmissionId)
      ? state.currentSubmissionId
      : null;
  if (currentId === previousId) currentId = null;

  if (
    previousId !== state.previousSubmissionId ||
    currentId !== state.currentSubmissionId ||
    currentId === null
  ) {
    if (currentId === null) {
      currentId = await dispatchNext(tx, {
        eventId: ctx.eventId,
        judgeId: ctx.judge.id,
        previousId,
      });
    }
    // Without a current project there's nothing to compare against yet, so
    // the judge starts over with Begin once one turns up.
    if (currentId === null) previousId = null;
    await tx
      .update(judgeState)
      .set({
        previousSubmissionId: previousId,
        currentSubmissionId: currentId,
        assignedAt:
          currentId !== state.currentSubmissionId
            ? new Date()
            : state.assignedAt,
      })
      .where(eq(judgeState.judgeId, ctx.judge.id));
  }

  return { previousId, currentId };
}

/** Moves the judge on: `fromId` becomes previous (or stays, for a skip). */
async function advance(
  tx: Tx,
  ctx: Extract<JudgeContext, { ok: true }>,
  previousId: string | null,
  leavingId: string,
): Promise<void> {
  const currentId = await dispatchNext(tx, {
    eventId: ctx.eventId,
    judgeId: ctx.judge.id,
    previousId,
    alsoExclude: leavingId,
  });
  await tx
    .update(judgeState)
    .set({
      previousSubmissionId: currentId === null ? null : previousId,
      currentSubmissionId: currentId,
      assignedAt: new Date(),
    })
    .where(eq(judgeState.judgeId, ctx.judge.id));
}

async function buildView(
  ctx: Extract<JudgeContext, { ok: true }>,
  assignment: { previousId: string | null; currentId: string | null },
): Promise<JudgeView> {
  const { previousId, currentId } = assignment;
  if (!currentId) return { kind: 'waiting', eventName: ctx.eventName };

  const ids = previousId ? [previousId, currentId] : [currentId];
  const [rows, notes, tables, criteria] = await Promise.all([
    db
      .select({ id: submissions.id, title: submissions.title })
      .from(submissions)
      .where(inArray(submissions.id, ids)),
    db
      .select({ submissionId: judgeNotes.submissionId, body: judgeNotes.body })
      .from(judgeNotes)
      .where(
        and(
          eq(judgeNotes.userId, ctx.userId),
          inArray(judgeNotes.submissionId, ids),
        ),
      ),
    getTableNumbers(ctx.eventId),
    loadCriteria(ctx.eventId),
  ]);
  const card = (id: string): JudgeProjectCard => ({
    id,
    title: rows.find((row) => row.id === id)?.title ?? '',
    tableNumber: tables.get(id) ?? 0,
    note: notes.find((note) => note.submissionId === id)?.body ?? '',
  });

  if (!previousId) {
    return {
      kind: 'begin',
      eventName: ctx.eventName,
      current: card(currentId),
    };
  }
  return {
    kind: 'compare',
    eventName: ctx.eventName,
    previous: card(previousId),
    current: card(currentId),
    criteria: criteria.map(({ id, name, description }) => ({
      id,
      name,
      description,
    })),
  };
}

/**
 * The judge's current screen. Not a pure read: it assigns a project when the
 * judge has none (first visit, or theirs left the pool), which is why it's an
 * action and not a cached getter.
 */
export async function getJudgeView(eventId: string): Promise<JudgeView> {
  const ctx = await loadJudgeContext(eventId);
  if (!ctx.ok) return ctx.view;
  const assignment = await db.transaction((tx) => settleAssignment(tx, ctx));
  return buildView(ctx, assignment);
}

const idSchema = z.uuid();

/** Begin: the first project becomes what the next one is compared against. */
export async function beginJudging(
  eventId: string,
  currentId: string,
): Promise<ActionResult<JudgeView>> {
  if (!idSchema.safeParse(currentId).success) return fail('Invalid project.');
  const ctx = await loadJudgeContext(eventId);
  if (!ctx.ok) return ok(ctx.view);

  const assignment = await db.transaction(async (tx) => {
    const settled = await settleAssignment(tx, ctx);
    // Stale screen (another tab moved on): just show where they are.
    if (settled.previousId !== null || settled.currentId !== currentId) {
      return settled;
    }
    await advance(tx, ctx, currentId, currentId);
    const state = await lockState(tx, ctx.judge.id);
    return {
      previousId: state.previousSubmissionId,
      currentId: state.currentSubmissionId,
    };
  });
  return ok(await buildView(ctx, assignment));
}

const voteSchema = z.object({
  previousId: z.uuid(),
  currentId: z.uuid(),
  /** criterion id → which project was better on it. */
  winners: z.record(z.uuid(), z.enum(['previous', 'current'])),
});

export type VoteInput = z.infer<typeof voteSchema>;

/**
 * Previous or Current, for every criterion; then on to the next table. A
 * project that left the pool mid-visit is ignored, as in Gavel: no votes are
 * recorded, but the judge still moves on.
 */
export async function submitJudgeVote(
  eventId: string,
  input: VoteInput,
): Promise<ActionResult<JudgeView>> {
  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) return fail('Invalid vote.');
  const { previousId, currentId, winners } = parsed.data;

  const ctx = await loadJudgeContext(eventId);
  if (!ctx.ok) return ok(ctx.view);

  const criteria = await loadCriteria(eventId);
  const choices = new Map<string, 'previous' | 'current'>();
  for (const criterion of criteria) {
    const choice = winners[criterion.id];
    if (!choice) return fail(`Pick a project for “${criterion.name}”.`);
    choices.set(criterion.id, choice);
  }

  const assignment = await db.transaction(async (tx) => {
    const state = await lockState(tx, ctx.judge.id);
    if (
      state.previousSubmissionId !== previousId ||
      state.currentSubmissionId !== currentId
    ) {
      return settleAssignment(tx, ctx);
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
    const next = await lockState(tx, ctx.judge.id);
    return {
      previousId: next.previousSubmissionId,
      currentId: next.currentSubmissionId,
    };
  });
  return ok(await buildView(ctx, assignment));
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
  input: z.infer<typeof skipSchema>,
): Promise<ActionResult<JudgeView>> {
  const parsed = skipSchema.safeParse(input);
  if (!parsed.success) return fail('Invalid skip.');
  const { currentId, reason } = parsed.data;

  const ctx = await loadJudgeContext(eventId);
  if (!ctx.ok) return ok(ctx.view);

  const assignment = await db.transaction(async (tx) => {
    const settled = await settleAssignment(tx, ctx);
    if (settled.currentId !== currentId) return settled;

    await tx
      .insert(judgeSkips)
      .values({ judgeId: ctx.judge.id, submissionId: currentId, reason });
    await advance(tx, ctx, settled.previousId, currentId);
    const next = await lockState(tx, ctx.judge.id);
    return {
      previousId: next.previousSubmissionId,
      currentId: next.currentSubmissionId,
    };
  });
  return ok(await buildView(ctx, assignment));
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
