/**
 * Server actions for organizing expo judging, under
 * dashboard/admin/events/:id/judging.
 *
 * - `judging:manage:all`: criteria, weights, the judge roster, and
 *   deactivating projects.
 * - `judging:results:all`: the live rankings.
 * - `judging:award:all`: finalists and overall placements.
 *
 * Judges themselves never come through here; see `@/app/dashboard/events/judge-actions`.
 */

'use server';

import { and, asc, count, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  eventJudges,
  events,
  judgingCriteria,
  judgingVotes,
  submissions,
  user as authUser,
} from '@/db/schema';
import { eventUrlSegments } from '@/lib/events';
import { JUDGE_PRIOR } from '@/lib/judging/crowd-bt';
import { sendJudgeInvite } from '@/lib/judging/judge-invite';
import {
  CRITERION_DESCRIPTION_MAX_LENGTH,
  CRITERION_MAX_WEIGHT,
  CRITERION_NAME_MAX_LENGTH,
  MAX_PLACEMENT,
} from '@/lib/judging/limits';
import { overallScore, reliabilityMean } from '@/lib/judging/results';
import {
  eventHasVotes,
  getTableNumbers,
  inPoolCondition,
  loadCriteria,
  loadResultsPool,
  normalizeJudgeEmail,
  replayEventVotes,
} from '@/lib/judging/server';
import { isPastSubmissionDeadline } from '@/lib/submissions';
import { hasPermission } from '@/lib/rbac/authorization';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { getUser } from '@/utils/auth';
import { writeAuditLog } from '@/utils/audit-log';
import { db } from '@/utils/db';

type JudgingPermission =
  | 'judging:manage:all'
  | 'judging:results:all'
  | 'judging:award:all';

/** The caller's id if they hold `permission`, else a failure to return. */
async function authorize(
  permission: JudgingPermission,
): Promise<{ userId: string } | { error: ActionResult<never> }> {
  const user = await getUser();
  if (!user) return { error: fail('Not authenticated') };
  if (!(await hasPermission(user.id, permission))) {
    return { error: fail('You do not have permission to do that.') };
  }
  return { userId: user.id };
}

async function revalidateJudging(eventId: string): Promise<void> {
  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/admin/events/${segment}/judging`);
    revalidatePath(`/dashboard/admin/events/${segment}/judging/results`);
  }
}

const STRUCTURE_LOCKED =
  'Judging has started. Criteria can no longer be added, removed or reordered — only renamed and reweighted.';

/** "Deleted judge #1a2b3c4d" — what's left once a judge deletes their account. */
function judgeLabel(row: {
  id: string;
  name: string | null;
  email: string | null;
}): string {
  return row.name || row.email || `Deleted judge #${row.id.slice(0, 8)}`;
}

// ── Overview for the Judging page ─────────────────────────────────────────

export type JudgingCriterionRow = {
  id: string;
  name: string;
  description: string;
  weight: number;
};

export type JudgingRosterRow = {
  id: string;
  label: string;
  email: string | null;
  /** Signed in at least once since being added. */
  linked: boolean;
  /** The account behind the row was deleted. */
  deleted: boolean;
  disabled: boolean;
  comparisons: number;
};

export type JudgingProjectRow = {
  id: string;
  title: string;
  tableNumber: number;
  published: boolean;
  deactivated: boolean;
};

export type JudgingAdminData = {
  criteria: JudgingCriterionRow[];
  /** A vote exists: criteria can't be added, removed or reordered. */
  structureLocked: boolean;
  judges: JudgingRosterRow[];
  projects: JudgingProjectRow[];
};

/** Everything the Judging page shows. Requires judging:manage:all. */
export async function getJudgingAdmin(
  eventId: string,
): Promise<ActionResult<JudgingAdminData>> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const [criteria, structureLocked, judges, voteCounts, projects, tables] =
    await Promise.all([
      loadCriteria(eventId),
      eventHasVotes(eventId),
      db
        .select({
          id: eventJudges.id,
          email: eventJudges.email,
          userId: eventJudges.userId,
          name: authUser.name,
          disabledAt: eventJudges.disabledAt,
        })
        .from(eventJudges)
        .leftJoin(authUser, eq(authUser.id, eventJudges.userId))
        .where(eq(eventJudges.eventId, eventId))
        .orderBy(asc(eventJudges.createdAt)),
      db
        .select({ judgeId: judgingVotes.judgeId, votes: count() })
        .from(judgingVotes)
        .innerJoin(eventJudges, eq(eventJudges.id, judgingVotes.judgeId))
        .where(eq(eventJudges.eventId, eventId))
        .groupBy(judgingVotes.judgeId),
      db
        .select({
          id: submissions.id,
          title: submissions.title,
          published: submissions.published,
          deactivatedAt: submissions.deactivatedAt,
        })
        .from(submissions)
        .where(eq(submissions.eventId, eventId)),
      getTableNumbers(eventId),
    ]);

  // Every comparison casts one vote per criterion, and the criteria are
  // frozen from the first vote on, so this division is exact.
  const perComparison = Math.max(criteria.length, 1);
  const votesByJudge = new Map(
    voteCounts.map((row) => [row.judgeId, row.votes]),
  );

  return ok({
    criteria: criteria.map(({ id, name, description, weight }) => ({
      id,
      name,
      description,
      weight,
    })),
    structureLocked,
    judges: judges.map((row) => ({
      id: row.id,
      label: judgeLabel(row),
      email: row.email,
      linked: row.userId != null,
      deleted: row.userId == null && row.email == null,
      disabled: row.disabledAt != null,
      comparisons: Math.round((votesByJudge.get(row.id) ?? 0) / perComparison),
    })),
    projects: projects
      .map((row) => ({
        id: row.id,
        title: row.title,
        tableNumber: tables.get(row.id) ?? 0,
        published: row.published,
        deactivated: row.deactivatedAt != null,
      }))
      .sort((a, b) => a.tableNumber - b.tableNumber),
  });
}

// ── Criteria ──────────────────────────────────────────────────────────────

const criterionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the criterion a name.')
    .max(
      CRITERION_NAME_MAX_LENGTH,
      `Keep the name under ${CRITERION_NAME_MAX_LENGTH} characters.`,
    ),
  description: z
    .string()
    .trim()
    .max(
      CRITERION_DESCRIPTION_MAX_LENGTH,
      `Keep the description to one line (under ${CRITERION_DESCRIPTION_MAX_LENGTH} characters).`,
    )
    .refine(
      (value) => !/[\r\n]/.test(value),
      'Keep the description to one line.',
    ),
  weight: z
    .number({ error: 'Enter a weight.' })
    .finite('Enter a weight.')
    .min(0, 'Weights can’t be negative.')
    .max(
      CRITERION_MAX_WEIGHT,
      `Keep weights at or below ${CRITERION_MAX_WEIGHT}.`,
    ),
});

export type CriterionInput = z.input<typeof criterionSchema>;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input.';
}

/** Adds a criterion at the end. Only before the event's first vote. */
export async function createJudgingCriterion(
  eventId: string,
  input: CriterionInput,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;
  const parsed = criterionSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return fail('Event not found.');

  const result = await db.transaction(async (tx) => {
    // Serialize structure edits per event against each other.
    await tx.execute(
      sql`SELECT 1 FROM ${events} WHERE id = ${eventId} FOR UPDATE`,
    );
    if (await eventHasVotes(eventId, tx)) return fail(STRUCTURE_LOCKED);
    const [{ next }] = await tx
      .select({
        next: sql<number>`coalesce(max(${judgingCriteria.position}), -1)::int + 1`,
      })
      .from(judgingCriteria)
      .where(eq(judgingCriteria.eventId, eventId));
    await tx.insert(judgingCriteria).values({
      eventId,
      position: next,
      ...parsed.data,
    });
    return ok();
  });
  if (result.success) await revalidateJudging(eventId);
  return result;
}

/** Renames or reweights a criterion. Allowed at any time. */
export async function updateJudgingCriterion(
  eventId: string,
  criterionId: string,
  input: CriterionInput,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;
  const parsed = criterionSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const [updated] = await db
    .update(judgingCriteria)
    .set(parsed.data)
    .where(
      and(
        eq(judgingCriteria.id, criterionId),
        eq(judgingCriteria.eventId, eventId),
      ),
    )
    .returning({ id: judgingCriteria.id });
  if (!updated) return fail('Criterion not found.');
  await revalidateJudging(eventId);
  return ok();
}

/** Removes a criterion. Only before the event's first vote. */
export async function deleteJudgingCriterion(
  eventId: string,
  criterionId: string,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM ${events} WHERE id = ${eventId} FOR UPDATE`,
    );
    if (await eventHasVotes(eventId, tx)) return fail(STRUCTURE_LOCKED);
    const [deleted] = await tx
      .delete(judgingCriteria)
      .where(
        and(
          eq(judgingCriteria.id, criterionId),
          eq(judgingCriteria.eventId, eventId),
        ),
      )
      .returning({ id: judgingCriteria.id });
    return deleted ? ok() : fail('Criterion not found.');
  });
  if (result.success) await revalidateJudging(eventId);
  return result;
}

/** Moves a criterion one place up or down. Only before the event's first vote. */
export async function moveJudgingCriterion(
  eventId: string,
  criterionId: string,
  direction: 'up' | 'down',
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM ${events} WHERE id = ${eventId} FOR UPDATE`,
    );
    if (await eventHasVotes(eventId, tx)) return fail(STRUCTURE_LOCKED);
    const ordered = await loadCriteria(eventId, tx);
    const index = ordered.findIndex((c) => c.id === criterionId);
    if (index === -1) return fail('Criterion not found.');
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= ordered.length) return ok();

    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    // Renumber densely, which also heals any gaps or ties.
    for (const [position, criterion] of ordered.entries()) {
      if (criterion.position !== position) {
        await tx
          .update(judgingCriteria)
          .set({ position })
          .where(eq(judgingCriteria.id, criterion.id));
      }
    }
    return ok();
  });
  if (result.success) await revalidateJudging(eventId);
  return result;
}

// ── Roster ────────────────────────────────────────────────────────────────

const emailSchema = z.email('Enter a valid email address.');

/**
 * Adds a judge by email and sends them a "You're judging <event>" magic link.
 * An address that already has an account is linked straight away; a new one
 * is linked when they first sign in.
 */
export async function addEventJudge(
  eventId: string,
  email: string,
): Promise<ActionResult<{ emailSent: boolean }>> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;
  const normalized = normalizeJudgeEmail(email);
  if (!emailSchema.safeParse(normalized).success) {
    return fail('Enter a valid email address.');
  }

  const [event] = await db
    .select({ name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return fail('Event not found.');

  const [existingUser] = await db
    .select({ id: authUser.id })
    .from(authUser)
    .where(sql`lower(${authUser.email}) = ${normalized}`)
    .limit(1);

  const inserted = await db
    .insert(eventJudges)
    .values({ eventId, email: normalized })
    .onConflictDoNothing()
    .returning({ id: eventJudges.id });
  if (inserted.length === 0)
    return fail('That email is already on the roster.');
  const judgeId = inserted[0].id;

  if (existingUser) {
    // Skipped if this account is already on the roster under another address.
    await db
      .update(eventJudges)
      .set({ userId: existingUser.id })
      .where(
        and(
          eq(eventJudges.id, judgeId),
          sql`NOT EXISTS (SELECT 1 FROM ${eventJudges} other WHERE other.event_id = ${eventId} AND other.user_id = ${existingUser.id})`,
        ),
      );
  }

  await writeAuditLog({
    actorId: auth.userId,
    action: 'judging.judge.added',
    targetType: 'event_judge',
    targetId: judgeId,
    metadata: { eventId, email: normalized },
  });
  await revalidateJudging(eventId);

  try {
    await sendJudgeInvite({ email: normalized, eventName: event.name });
    return ok({ emailSent: true });
  } catch (error) {
    console.error('[addEventJudge] invite email failed', error);
    return ok({ emailSent: false });
  }
}

/** Sends the judge's invite again. */
export async function resendJudgeInvite(
  eventId: string,
  judgeId: string,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const [row] = await db
    .select({ email: eventJudges.email, eventName: events.name })
    .from(eventJudges)
    .innerJoin(events, eq(events.id, eventJudges.eventId))
    .where(and(eq(eventJudges.id, judgeId), eq(eventJudges.eventId, eventId)))
    .limit(1);
  if (!row) return fail('Judge not found.');
  if (!row.email) return fail('This judge deleted their account.');

  try {
    await sendJudgeInvite({ email: row.email, eventName: row.eventName });
    return ok();
  } catch (error) {
    console.error('[resendJudgeInvite] failed', error);
    return fail('Failed to send the invite.');
  }
}

/**
 * Disables (or re-enables) a judge. A disabled judge is never dispatched
 * again; their votes still count, weighted by their reliability.
 */
export async function setEventJudgeDisabled(
  eventId: string,
  judgeId: string,
  disabled: boolean,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const [updated] = await db
    .update(eventJudges)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(and(eq(eventJudges.id, judgeId), eq(eventJudges.eventId, eventId)))
    .returning({ id: eventJudges.id });
  if (!updated) return fail('Judge not found.');

  await writeAuditLog({
    actorId: auth.userId,
    action: disabled ? 'judging.judge.disabled' : 'judging.judge.enabled',
    targetType: 'event_judge',
    targetId: judgeId,
    metadata: { eventId },
  });
  await revalidateJudging(eventId);
  return ok();
}

/** Removes a judge from the roster — only while they have cast no votes. */
export async function removeEventJudge(
  eventId: string,
  judgeId: string,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const result = await db.transaction(async (tx) => {
    const [judge] = await tx
      .select({ id: eventJudges.id })
      .from(eventJudges)
      .where(and(eq(eventJudges.id, judgeId), eq(eventJudges.eventId, eventId)))
      .for('update');
    if (!judge) return fail('Judge not found.');
    const [vote] = await tx
      .select({ id: judgingVotes.id })
      .from(judgingVotes)
      .where(eq(judgingVotes.judgeId, judgeId))
      .limit(1);
    if (vote) {
      return fail('This judge has already voted. Disable them instead.');
    }
    await tx.delete(eventJudges).where(eq(eventJudges.id, judgeId));
    return ok();
  });

  if (result.success) {
    await writeAuditLog({
      actorId: auth.userId,
      action: 'judging.judge.removed',
      targetType: 'event_judge',
      targetId: judgeId,
      metadata: { eventId },
    });
    await revalidateJudging(eventId);
  }
  return result;
}

// ── Projects ──────────────────────────────────────────────────────────────

/**
 * Deactivates (or reactivates) a project: never dispatched again and left
 * out of results. Its votes are kept.
 */
export async function setSubmissionDeactivated(
  eventId: string,
  submissionId: string,
  deactivated: boolean,
): Promise<ActionResult> {
  const auth = await authorize('judging:manage:all');
  if ('error' in auth) return auth.error;

  const [updated] = await db
    .update(submissions)
    .set({ deactivatedAt: deactivated ? new Date() : null })
    .where(
      and(eq(submissions.id, submissionId), eq(submissions.eventId, eventId)),
    )
    .returning({ id: submissions.id });
  if (!updated) return fail('Project not found.');

  await writeAuditLog({
    actorId: auth.userId,
    action: deactivated
      ? 'judging.submission.deactivated'
      : 'judging.submission.reactivated',
    targetType: 'submission',
    targetId: submissionId,
    metadata: { eventId },
  });
  await revalidateJudging(eventId);
  return ok();
}

// ── Results & awards ──────────────────────────────────────────────────────

export type ResultsProjectRow = {
  id: string;
  title: string;
  tableNumber: number;
  finalist: boolean;
  placement: number | null;
  /** Weighted mean of per-criterion μ. Absent without judging:results:all. */
  score?: number;
};

type ResultsCriterionTable = {
  id: string;
  name: string;
  weight: number;
  rows: {
    id: string;
    title: string;
    tableNumber: number;
    mu: number;
    sigmaSq: number;
    comparisons: number;
  }[];
};

type ResultsJudgeRow = {
  id: string;
  label: string;
  disabled: boolean;
  /** In-pool comparisons that count toward results. */
  comparisons: number;
  /** criterion id → α / (α + β); the prior for a judge with no votes on it. */
  reliability: Record<string, number>;
};

export type JudgingResults = {
  canViewRankings: boolean;
  canAward: boolean;
  /** Before the submission deadline the pool can still change. */
  provisional: boolean;
  criteria: { id: string; name: string }[];
  /** By Overall score with rankings; by table number without. */
  overall: ResultsProjectRow[];
  /** Empty without judging:results:all. */
  byCriterion: ResultsCriterionTable[];
  judges: ResultsJudgeRow[];
};

/**
 * The live results, recomputed on every call by replaying the in-pool votes.
 * Requires judging:results:all or judging:award:all; an award-only caller
 * gets the project list without any ranking, to flag finalists from.
 */
export async function getJudgingResults(
  eventId: string,
): Promise<ActionResult<JudgingResults>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  const [canViewRankings, canAward] = await Promise.all([
    hasPermission(user.id, 'judging:results:all'),
    hasPermission(user.id, 'judging:award:all'),
  ]);
  if (!canViewRankings && !canAward) {
    return fail('You do not have permission to view results.');
  }

  const [[event], criteria, pool, tables] = await Promise.all([
    db
      .select({ submissionsCloseAt: events.submissionsCloseAt })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1),
    loadCriteria(eventId),
    loadResultsPool(eventId),
    getTableNumbers(eventId),
  ]);
  if (!event) return fail('Event not found.');

  const provisional = !isPastSubmissionDeadline(event.submissionsCloseAt);
  const base = pool.map((project) => ({
    ...project,
    tableNumber: tables.get(project.id) ?? 0,
  }));
  const byTable = (a: { tableNumber: number }, b: { tableNumber: number }) =>
    a.tableNumber - b.tableNumber;

  if (!canViewRankings) {
    return ok({
      canViewRankings,
      canAward,
      provisional,
      criteria: [],
      overall: base.sort(byTable),
      byCriterion: [],
      judges: [],
    });
  }

  const criterionIds = criteria.map((c) => c.id);
  const replay = await replayEventVotes(
    eventId,
    new Set(pool.map((p) => p.id)),
    criterionIds,
  );

  const overall = base
    .map((project) => ({
      ...project,
      score: overallScore(replay.byCriterion, criteria, project.id),
    }))
    .sort((a, b) => b.score - a.score || byTable(a, b));

  const byCriterion = criteria.map((criterion) => ({
    id: criterion.id,
    name: criterion.name,
    weight: criterion.weight,
    rows: base
      .map((project) => {
        const result = replay.byCriterion.get(criterion.id)!.get(project.id)!;
        return {
          id: project.id,
          title: project.title,
          tableNumber: project.tableNumber,
          ...result,
        };
      })
      .sort((a, b) => b.mu - a.mu || byTable(a, b)),
  }));

  const judgeRows = await db
    .select({
      id: eventJudges.id,
      email: eventJudges.email,
      name: authUser.name,
      disabledAt: eventJudges.disabledAt,
    })
    .from(eventJudges)
    .leftJoin(authUser, eq(authUser.id, eventJudges.userId))
    .where(eq(eventJudges.eventId, eventId))
    .orderBy(asc(eventJudges.createdAt));
  const perComparison = Math.max(criteria.length, 1);
  const judges = judgeRows.map((row) => {
    const reliability = replay.reliability.get(row.id);
    return {
      id: row.id,
      label: judgeLabel(row),
      disabled: row.disabledAt != null,
      comparisons: Math.round(
        (replay.votesByJudge.get(row.id) ?? 0) / perComparison,
      ),
      reliability: Object.fromEntries(
        criterionIds.map((id) => [
          id,
          reliabilityMean(reliability?.get(id) ?? JUDGE_PRIOR),
        ]),
      ),
    };
  });

  return ok({
    canViewRankings,
    canAward,
    provisional,
    criteria: criteria.map(({ id, name }) => ({ id, name })),
    overall,
    byCriterion,
    judges,
  });
}

/** A project that counts for results — the only ones that can be awarded. */
async function findAwardableProject(eventId: string, submissionId: string) {
  const [row] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(submissions.eventId, eventId),
        inPoolCondition(),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Flags (or unflags) a finalist. Requires judging:award:all. */
export async function setSubmissionFinalist(
  eventId: string,
  submissionId: string,
  finalist: boolean,
): Promise<ActionResult> {
  const auth = await authorize('judging:award:all');
  if ('error' in auth) return auth.error;
  if (!(await findAwardableProject(eventId, submissionId))) {
    return fail('That project isn’t in the judging results.');
  }

  await db
    .update(submissions)
    .set({ finalist })
    .where(eq(submissions.id, submissionId));
  await writeAuditLog({
    actorId: auth.userId,
    action: finalist
      ? 'judging.submission.finalist_set'
      : 'judging.submission.finalist_cleared',
    targetType: 'submission',
    targetId: submissionId,
    metadata: { eventId },
  });
  await revalidateJudging(eventId);
  return ok();
}

const placementSchema = z
  .number()
  .int('Enter a whole number.')
  .min(1, 'Placements start at 1.')
  .max(MAX_PLACEMENT, `Placements go up to ${MAX_PLACEMENT}.`)
  .nullable();

/**
 * Records a project's overall placement (1st, 2nd, …), or clears it with
 * null. Each place is held by at most one project per event. Requires
 * judging:award:all.
 */
export async function setSubmissionPlacement(
  eventId: string,
  submissionId: string,
  placement: number | null,
): Promise<ActionResult> {
  const auth = await authorize('judging:award:all');
  if ('error' in auth) return auth.error;
  const parsed = placementSchema.safeParse(placement);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!(await findAwardableProject(eventId, submissionId))) {
    return fail('That project isn’t in the judging results.');
  }

  if (parsed.data !== null) {
    const [holder] = await db
      .select({ title: submissions.title })
      .from(submissions)
      .where(
        and(
          eq(submissions.eventId, eventId),
          eq(submissions.placement, parsed.data),
          sql`${submissions.id} <> ${submissionId}`,
        ),
      )
      .limit(1);
    if (holder) {
      return fail(`“${holder.title}” already holds place ${parsed.data}.`);
    }
  }

  try {
    await db
      .update(submissions)
      .set({ placement: parsed.data })
      .where(eq(submissions.id, submissionId));
  } catch (error) {
    // Lost a race for the same place: the partial unique index caught it.
    console.error('[setSubmissionPlacement] failed', error);
    return fail(`Another project already holds place ${parsed.data}.`);
  }
  await writeAuditLog({
    actorId: auth.userId,
    action: 'judging.submission.placement_set',
    targetType: 'submission',
    targetId: submissionId,
    metadata: { eventId, placement: parsed.data },
  });
  await revalidateJudging(eventId);
  return ok();
}
