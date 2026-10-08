/**
 * The judge's side of expo judging: who may judge right now, where they've
 * been sent, and the screen that follows from it. The judge page renders
 * `getJudgeView`; the actions in `@/app/dashboard/events/judge-actions` move
 * the judge along and refresh it.
 *
 * Judges are authorized by roster membership — a non-disabled `event_judges`
 * row for the event matched to the signed-in user — never by a permission,
 * the same way team membership authorizes participants.
 *
 * Every write locks the judge's `judge_state` row, so a double-tapped button
 * or a second open tab can't record a comparison twice: forms send back the
 * ids they were shown, and a mismatch just leaves the judge where they are.
 */

import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { events, judgeNotes, judgeState, submissions } from '@/db/schema';
import {
  dispatchNext,
  findJudgeForUser,
  getJudgingWindow,
  getTableLabels,
  inPoolCondition,
  loadCriteria,
  type JudgeRow,
} from '@/lib/judging/server';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';

export type JudgeProjectCard = {
  id: string;
  title: string;
  /** "B3" — every project a judge is sent to is published, so has one. */
  tableLabel: string;
  /** The judge's own private note; empty when they haven't written one. */
  note: string;
};

export type JudgeCriterion = { id: string; name: string; description: string };

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

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type JudgeContext =
  | { ok: false; view: JudgeView }
  | {
      ok: true;
      userId: string;
      judge: JudgeRow;
      eventId: string;
      eventName: string;
    };

/** Who's asking, and whether they may judge this event right now. */
export async function loadJudgeContext(eventId: string): Promise<JudgeContext> {
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
export async function lockState(tx: Tx, judgeId: string) {
  await tx.insert(judgeState).values({ judgeId }).onConflictDoNothing();
  const [state] = await tx
    .select()
    .from(judgeState)
    .where(eq(judgeState.judgeId, judgeId))
    .for('update');
  return state!;
}

export async function poolMembers(
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
 * or departed current project is replaced by a fresh dispatch. A judge with
 * nowhere to go keeps their previous project for when one turns up.
 */
export async function settleAssignment(
  tx: Tx,
  ctx: Extract<JudgeContext, { ok: true }>,
): Promise<{ previousId: string | null; currentId: string | null }> {
  const state = await lockState(tx, ctx.judge.id);
  const active = await poolMembers(tx, ctx.eventId, [
    state.previousSubmissionId,
    state.currentSubmissionId,
  ]);
  const previousId =
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
export async function advance(
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
      // Kept while there's nowhere to go, so the next project that turns up
      // is compared against it rather than sending the judge back to Begin.
      previousSubmissionId: previousId,
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
    getTableLabels(ctx.eventId),
    loadCriteria(ctx.eventId),
  ]);
  const card = (id: string): JudgeProjectCard => ({
    id,
    title: rows.find((row) => row.id === id)?.title ?? '',
    tableLabel: tables.get(id)?.label ?? '—',
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
 * judge has none (first visit, or theirs left the pool), so it's only ever
 * rendered dynamically, never cached.
 */
export async function getJudgeView(eventId: string): Promise<JudgeView> {
  const ctx = await loadJudgeContext(eventId);
  if (!ctx.ok) return ctx.view;
  const assignment = await db.transaction((tx) => settleAssignment(tx, ctx));
  return buildView(ctx, assignment);
}
