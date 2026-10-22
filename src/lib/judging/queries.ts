import 'server-only';

import { and, asc, count, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { Queryable } from '@/lib/team-membership';
import { db } from '@/utils/db';

import { JUDGE_PRIOR, PROJECT_PRIOR, update, type JudgeReliability, type ProjectEstimate } from './crowd-bt';
import { BUSY_WINDOW_MS, chooseNext, type DispatchCandidate } from './dispatch';
import { replayVotes, type ReplayResult } from './results';
import { DEFAULT_TABLE_LAYOUT, formatTableLabel, type TableLayout } from './table-label';

/**
 * Database side of expo judging: who is a judge, what's in the pool, where to
 * send a judge next, and the online model updates. The math lives in the pure
 * modules next to this one.
 */

/** A judge who skipped a project as "Team not here" may be sent back after this. */
const NOT_HERE_RETRY_MS = 10 * 60 * 1000;

export type JudgeRow = typeof schema.eventJudges.$inferSelect;

type JudgingEvent = {
  startsAt: Date | null;
  endsAt: Date | null;
};

/** Judging runs from the event's start to its end; no admin controls. */
export function getJudgingWindow(event: JudgingEvent, now: Date = new Date()): 'not_open' | 'open' | 'closed' {
  if (!event.startsAt || !event.endsAt) return 'not_open';
  if (now.getTime() < event.startsAt.getTime()) return 'not_open';
  if (now.getTime() >= event.endsAt.getTime()) return 'closed';
  return 'open';
}

export function normalizeJudgeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Matches a roster row to a signed-in user: linked to them, or not linked yet
 * and carrying their (verified) email. Covers the gap before the sign-in hook
 * has linked a freshly added address.
 */
export function rosterMatch(user: { id: string; email: string }) {
  return or(
    eq(schema.eventJudges.userId, user.id),
    and(isNull(schema.eventJudges.userId), eq(schema.eventJudges.email, normalizeJudgeEmail(user.email))),
  );
}

/** The caller's roster row for this event, disabled or not. */
export async function findJudgeForUser(
  eventId: string,
  user: { id: string; email: string },
  dbHandle: Queryable = db,
): Promise<JudgeRow | null> {
  const [row] = await dbHandle
    .select()
    .from(schema.eventJudges)
    .where(and(eq(schema.eventJudges.eventId, eventId), rosterMatch(user)))
    // A linked row wins over an unlinked one for the same event.
    .orderBy(sql`${schema.eventJudges.userId} IS NULL`)
    .limit(1);
  return row ?? null;
}

/** Shown wherever a judge tries to sign up for the event they're judging. */
export const JUDGE_SIGNUP_BLOCKED_MESSAGE = 'You’re judging this event, so you can’t also sign up for it.';

/**
 * On this event's roster, disabled or not. Judges may not also sign up for
 * an event they judge: a paused judge is still one, and their votes count.
 */
export async function isJudgingEvent(eventId: string, user: { id: string; email: string }): Promise<boolean> {
  return (await findJudgeForUser(eventId, user)) != null;
}

/** Shown when an organizer tries to add one of the event's own participants. */
export const JUDGE_IS_PARTICIPANT_MESSAGE = 'That person is taking part in this event, so they can’t judge it.';

/**
 * Taking part in the event, so not allowed to judge it: on a team, or
 * registered and not yet out of the running (denied, declined or timed
 * out). A stored `invited` past its deadline still counts — it may simply
 * not have been swept to `timed_out` yet, and erring towards "conflict" is
 * the safe side.
 */
export async function isParticipatingInEvent(eventId: string, userId: string): Promise<boolean> {
  const [row] = await db.execute<{ participating: boolean }>(sql`
    SELECT EXISTS (
             SELECT 1 FROM ${schema.teamMembers}
              WHERE event_id = ${eventId} AND user_id = ${userId}
           )
        OR EXISTS (
             SELECT 1 FROM ${schema.eventParticipants} p
               JOIN ${schema.participationStatuses} st ON st.id = p.status_id
              WHERE p.event_id = ${eventId}
                AND p.user_id = ${userId}
                AND st.label NOT IN ('denied', 'declined', 'timed_out')
           ) AS participating
  `);
  return Boolean(row?.participating);
}

/** Every event whose roster the user is on. */
export async function listJudgeEventsForUser(user: { id: string; email: string }): Promise<
  {
    eventId: string;
    name: string;
    startsAt: Date | null;
    endsAt: Date | null;
    disabled: boolean;
  }[]
> {
  const rows = await db
    .select({
      eventId: schema.events.id,
      name: schema.events.name,
      startsAt: schema.events.startsAt,
      endsAt: schema.events.endsAt,
      disabledAt: schema.eventJudges.disabledAt,
    })
    .from(schema.eventJudges)
    .innerJoin(schema.events, eq(schema.events.id, schema.eventJudges.eventId))
    .where(rosterMatch(user))
    .orderBy(asc(schema.events.startsAt), asc(schema.events.name));
  return rows.map(({ disabledAt, ...row }) => ({
    ...row,
    disabled: disabledAt != null,
  }));
}

/** On any roster at all — decides the judge onboarding path. */
export async function isOnAnyJudgeRoster(user: { id: string; email: string }): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.eventJudges.id })
    .from(schema.eventJudges)
    .where(rosterMatch(user))
    .limit(1);
  return row != null;
}

/**
 * Links roster rows added by email to the account that now owns that email.
 * Called on every sign-in (sessions only exist for verified addresses); a row
 * for an event the user is already linked to under another address is left
 * alone rather than tripping the unique index.
 */
export async function linkJudgeRosterRows(userId: string): Promise<void> {
  await db.execute(sql`
    UPDATE ${schema.eventJudges} AS ej
       SET user_id = u.id
      FROM ${schema.user} u
     WHERE u.id = ${userId}
       AND ej.user_id IS NULL
       AND ej.email = lower(u.email)
       AND NOT EXISTS (
         SELECT 1 FROM ${schema.eventJudges} other
          WHERE other.event_id = ej.event_id AND other.user_id = u.id
       )
  `);
}

/** Criteria in display order. */
export async function loadCriteria(
  eventId: string,
  dbHandle: Queryable = db,
): Promise<(typeof schema.judgingCriteria.$inferSelect)[]> {
  return dbHandle
    .select()
    .from(schema.judgingCriteria)
    .where(eq(schema.judgingCriteria.eventId, eventId))
    .orderBy(asc(schema.judgingCriteria.position), asc(schema.judgingCriteria.createdAt));
}

/**
 * Takes the event row's shared judging lock, first thing in every judge
 * transaction (dispatch, begin, vote, skip). Judges don't block each other,
 * but the organizer saves that change what they're shown — criteria and the
 * table layout, which lock the row FOR UPDATE — wait for them, and they for
 * those. Reading the criteria after this, in the same transaction, gives a
 * set no save can change before commit. FOR KEY SHARE rather than FOR SHARE
 * so ordinary event edits aren't blocked.
 */
export async function lockEventForJudging(tx: Queryable, eventId: string): Promise<void> {
  await tx.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, eventId)).for('key share');
}

/**
 * Some judge has been sent to a table: `assigned_at` is only ever set once a
 * project has been assigned. From then on the table layout is fixed, since
 * changing it relabels tables under judges already walking to them.
 */
export async function judgesSentToTables(eventId: string, dbHandle: Queryable = db): Promise<boolean> {
  const [row] = await dbHandle
    .select({ judgeId: schema.judgeState.judgeId })
    .from(schema.judgeState)
    .innerJoin(schema.eventJudges, eq(schema.eventJudges.id, schema.judgeState.judgeId))
    .where(and(eq(schema.eventJudges.eventId, eventId), isNotNull(schema.judgeState.assignedAt)))
    .limit(1);
  return row != null;
}

/** Once any vote exists, criteria can only be renamed or reweighted. */
export async function eventHasVotes(eventId: string, dbHandle: Queryable = db): Promise<boolean> {
  const [row] = await dbHandle
    .select({ id: schema.judgingVotes.id })
    .from(schema.judgingVotes)
    .innerJoin(schema.judgingCriteria, eq(schema.judgingCriteria.id, schema.judgingVotes.criterionId))
    .where(eq(schema.judgingCriteria.eventId, eventId))
    .limit(1);
  return row != null;
}

/** The event's expo floor layout; the default for an unknown event. */
export async function loadTableLayout(eventId: string, dbHandle: Queryable = db): Promise<TableLayout> {
  const [row] = await dbHandle
    .select({
      rows: schema.events.judgingTableRows,
      rowAlphabet: schema.events.judgingTableRowAlphabet,
      columnAlphabet: schema.events.judgingTableColumnAlphabet,
    })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  return row ?? DEFAULT_TABLE_LAYOUT;
}

export type TableAssignment = { slot: number; label: string };

/**
 * submission id → its stored table slot and the label the event's layout
 * gives it. Submissions never published have no table and are left out.
 */
export async function getTableLabels(eventId: string, dbHandle: Queryable = db): Promise<Map<string, TableAssignment>> {
  const [layout, rows] = await Promise.all([
    loadTableLayout(eventId, dbHandle),
    dbHandle
      .select({ id: schema.submissions.id, slot: schema.submissions.tableSlot })
      .from(schema.submissions)
      .where(and(eq(schema.submissions.eventId, eventId), isNotNull(schema.submissions.tableSlot))),
  ]);
  return new Map(rows.map((row) => [row.id, { slot: row.slot!, label: formatTableLabel(row.slot!, layout) }]));
}

/** Orders by table slot, projects without a table last. */
export function byTableSlot(a: { tableSlot: number | null }, b: { tableSlot: number | null }): number {
  return (a.tableSlot ?? Infinity) - (b.tableSlot ?? Infinity);
}

/**
 * Gives a submission its expo table, if it doesn't have one yet. Called in
 * the publish transaction, so a project takes a table the first time it goes
 * public — a draft never does — and keeps it through unpublish/republish.
 *
 * The slot comes from the event's counter, incremented in the same statement:
 * the row lock serializes concurrent publishers, and since the counter only
 * goes up a deleted project's slot is never handed to anyone else (the
 * unique index on `(event_id, table_slot)` is the backstop).
 */
export async function assignTableSlot(
  tx: Pick<typeof db, 'execute'>,
  eventId: string,
  submissionId: string,
): Promise<void> {
  // Raw SQL so the counter bump doesn't touch `events.updated_at`.
  await tx.execute(sql`
    WITH target AS (
      SELECT id FROM ${schema.submissions}
       WHERE id = ${submissionId}
         AND event_id = ${eventId}
         AND table_slot IS NULL
    ), claimed AS (
      UPDATE ${schema.events}
         SET judging_next_table_slot = judging_next_table_slot + 1
       WHERE id = ${eventId} AND EXISTS (SELECT 1 FROM target)
      RETURNING judging_next_table_slot - 1 AS slot
    )
    UPDATE ${schema.submissions}
       SET table_slot = (SELECT slot FROM claimed)
     WHERE id IN (SELECT id FROM target)
  `);
}

/** Projects judges can be sent to: published and not deactivated. */
export function inPoolCondition() {
  return and(eq(schema.submissions.published, true), isNull(schema.submissions.deactivatedAt));
}

async function loadPoolIds(eventId: string, dbHandle: Queryable): Promise<Set<string>> {
  const rows = await dbHandle
    .select({ id: schema.submissions.id })
    .from(schema.submissions)
    .where(and(eq(schema.submissions.eventId, eventId), inPoolCondition()))
    // A fixed order, so the same random stream always dispatches the same way
    // (src/tests/gavel-differential.test.ts replays one against Gavel).
    .orderBy(asc(schema.submissions.createdAt), asc(schema.submissions.id));
  return new Set(rows.map((row) => row.id));
}

async function loadEstimates(
  submissionIds: string[],
  dbHandle: Queryable,
): Promise<Map<string, Map<string, ProjectEstimate>>> {
  const out = new Map<string, Map<string, ProjectEstimate>>();
  if (submissionIds.length === 0) return out;
  const rows = await dbHandle
    .select()
    .from(schema.submissionScores)
    .where(inArray(schema.submissionScores.submissionId, submissionIds));
  for (const row of rows) {
    const map = out.get(row.submissionId) ?? new Map();
    map.set(row.criterionId, { mu: row.mu, sigmaSq: row.sigmaSq });
    out.set(row.submissionId, map);
  }
  return out;
}

async function loadReliability(judgeId: string, dbHandle: Queryable): Promise<Map<string, JudgeReliability>> {
  const rows = await dbHandle
    .select()
    .from(schema.judgeReliability)
    .where(eq(schema.judgeReliability.judgeId, judgeId));
  return new Map(rows.map((row) => [row.criterionId, { alpha: row.alpha, beta: row.beta }]));
}

/**
 * Records that the judge has been at a project — begun on it, or compared
 * it — so they're never sent back (`judge_visits`).
 */
export async function recordVisit(tx: Queryable, judgeId: string, submissionId: string): Promise<void> {
  await tx.insert(schema.judgeVisits).values({ judgeId, submissionId }).onConflictDoNothing();
}

/**
 * Projects this judge must not be sent to: everything they've been at,
 * conflicts of interest, "not here" skips still inside the retry window, and
 * their own team's project.
 */
async function loadExcludedForJudge(
  judgeId: string,
  previousId: string | null,
  now: Date,
  dbHandle: Queryable,
): Promise<Set<string>> {
  const [visited, skipped, ownTeam] = await Promise.all([
    dbHandle
      .select({ submissionId: schema.judgeVisits.submissionId })
      .from(schema.judgeVisits)
      .where(eq(schema.judgeVisits.judgeId, judgeId)),
    dbHandle
      .select({ submissionId: schema.judgeSkips.submissionId })
      .from(schema.judgeSkips)
      .where(
        and(
          eq(schema.judgeSkips.judgeId, judgeId),
          or(
            eq(schema.judgeSkips.reason, 'conflict'),
            gt(schema.judgeSkips.createdAt, new Date(now.getTime() - NOT_HERE_RETRY_MS)),
          ),
        ),
      ),
    // Adding a participant as a judge is refused, but someone could still
    // end up on both sides (a team joined under a second address the roster
    // later matched), so dispatch never relies on that alone.
    dbHandle
      .select({ submissionId: schema.submissions.id })
      .from(schema.submissions)
      .innerJoin(schema.teamMembers, eq(schema.teamMembers.teamId, schema.submissions.teamId))
      .innerJoin(schema.user, eq(schema.user.id, schema.teamMembers.userId))
      .innerJoin(
        schema.eventJudges,
        and(eq(schema.eventJudges.id, judgeId), eq(schema.eventJudges.eventId, schema.teamMembers.eventId)),
      )
      .where(
        or(
          eq(schema.teamMembers.userId, schema.eventJudges.userId),
          and(isNull(schema.eventJudges.userId), eq(sql`lower(${schema.user.email})`, schema.eventJudges.email)),
        ),
      ),
  ]);
  const excluded = new Set<string>();
  for (const row of visited) excluded.add(row.submissionId);
  for (const row of skipped) excluded.add(row.submissionId);
  for (const row of ownTeam) excluded.add(row.submissionId);
  if (previousId) excluded.add(previousId);
  return excluded;
}

/** submission id → judges who have been at it (Gavel's `len(item.viewed)`). */
async function loadViewCounts(eventId: string, dbHandle: Queryable): Promise<Map<string, number>> {
  const rows = await dbHandle
    .select({ submissionId: schema.judgeVisits.submissionId, views: count() })
    .from(schema.judgeVisits)
    .innerJoin(schema.eventJudges, eq(schema.eventJudges.id, schema.judgeVisits.judgeId))
    .where(eq(schema.eventJudges.eventId, eventId))
    .groupBy(schema.judgeVisits.submissionId);
  return new Map(rows.map((row) => [row.submissionId, row.views]));
}

/** Projects another active judge was sent to within the busy window. */
async function loadBusyIds(eventId: string, judgeId: string, now: Date, dbHandle: Queryable): Promise<Set<string>> {
  const rows = await dbHandle
    .select({ submissionId: schema.judgeState.currentSubmissionId })
    .from(schema.judgeState)
    .innerJoin(schema.eventJudges, eq(schema.eventJudges.id, schema.judgeState.judgeId))
    .where(
      and(
        eq(schema.eventJudges.eventId, eventId),
        ne(schema.judgeState.judgeId, judgeId),
        isNull(schema.eventJudges.disabledAt),
        isNotNull(schema.judgeState.currentSubmissionId),
        gt(schema.judgeState.assignedAt, new Date(now.getTime() - BUSY_WINDOW_MS)),
      ),
    );
  return new Set(rows.map((row) => row.submissionId!));
}

/**
 * Picks where to send `judge` next, coming from `previousId`. `alsoExclude`
 * covers a project the caller is moving the judge off right now.
 */
export async function dispatchNext(
  dbHandle: Queryable & Pick<typeof db, 'execute'>,
  options: {
    eventId: string;
    judgeId: string;
    previousId: string | null;
    alsoExclude?: string | null;
    now?: Date;
    random?: () => number;
  },
): Promise<string | null> {
  const now = options.now ?? new Date();
  const criteria = await loadCriteria(options.eventId, dbHandle);
  if (criteria.length === 0) return null;

  const [pool, excluded, views, busy, reliability] = await Promise.all([
    loadPoolIds(options.eventId, dbHandle),
    loadExcludedForJudge(options.judgeId, options.previousId, now, dbHandle),
    loadViewCounts(options.eventId, dbHandle),
    loadBusyIds(options.eventId, options.judgeId, now, dbHandle),
    loadReliability(options.judgeId, dbHandle),
  ]);
  if (options.alsoExclude) excluded.add(options.alsoExclude);

  const candidateIds = [...pool].filter((id) => !excluded.has(id));
  const estimates = await loadEstimates(
    options.previousId ? [...candidateIds, options.previousId] : candidateIds,
    dbHandle,
  );
  const candidates: DispatchCandidate[] = candidateIds.map((id) => ({
    id,
    views: views.get(id) ?? 0,
    busy: busy.has(id),
    estimates: estimates.get(id) ?? new Map(),
  }));

  return chooseNext({
    candidates,
    criterionIds: criteria.map((c) => c.id),
    previous: options.previousId ? { estimates: estimates.get(options.previousId) ?? new Map() } : null,
    reliability,
    random: options.random,
  });
}

/**
 * Records one comparison: a vote per criterion, and the online Crowd-BT
 * update of the judge's reliability and both projects' scores. Must run in
 * the caller's transaction, with the judge's state row already locked (so
 * reliability has a single writer); score rows are locked here in a fixed
 * order, since other judges update them concurrently.
 */
export async function recordComparison(
  tx: Queryable & Pick<typeof db, 'execute'>,
  options: {
    judgeId: string;
    previousId: string;
    currentId: string;
    /** criterion id → which side won. */
    winners: ReadonlyMap<string, 'previous' | 'current'>;
  },
): Promise<void> {
  const criterionIds = [...options.winners.keys()];
  const pair = [options.previousId, options.currentId].sort();

  // Make sure both projects have a score row per criterion, then lock them.
  await tx
    .insert(schema.submissionScores)
    .values(
      pair.flatMap((submissionId) =>
        criterionIds.map((criterionId) => ({
          submissionId,
          criterionId,
          mu: PROJECT_PRIOR.mu,
          sigmaSq: PROJECT_PRIOR.sigmaSq,
        })),
      ),
    )
    .onConflictDoNothing();
  await tx.execute(sql`
    SELECT 1 FROM ${schema.submissionScores}
     WHERE submission_id IN (${sql.join(
       pair.map((id) => sql`${id}`),
       sql`, `,
     )})
     ORDER BY submission_id, criterion_id
       FOR UPDATE
  `);

  const [estimates, reliability] = await Promise.all([loadEstimates(pair, tx), loadReliability(options.judgeId, tx)]);

  // Each criterion is its own model, so every update reads only the state
  // loaded above; the writes then go out as one statement per table rather
  // than four per criterion, to keep the score rows locked for less time.
  const votes: (typeof schema.judgingVotes.$inferInsert)[] = [];
  const reliabilities: (typeof schema.judgeReliability.$inferInsert)[] = [];
  const scores: (typeof schema.submissionScores.$inferInsert)[] = [];
  for (const [criterionId, side] of options.winners) {
    const winnerId = side === 'current' ? options.currentId : options.previousId;
    const loserId = side === 'current' ? options.previousId : options.currentId;
    const result = update(
      reliability.get(criterionId) ?? JUDGE_PRIOR,
      estimates.get(winnerId)?.get(criterionId) ?? PROJECT_PRIOR,
      estimates.get(loserId)?.get(criterionId) ?? PROJECT_PRIOR,
    );
    votes.push({
      judgeId: options.judgeId,
      criterionId,
      winnerSubmissionId: winnerId,
      loserSubmissionId: loserId,
    });
    reliabilities.push({
      judgeId: options.judgeId,
      criterionId,
      ...result.judge,
    });
    scores.push(
      { submissionId: winnerId, criterionId, ...result.winner },
      { submissionId: loserId, criterionId, ...result.loser },
    );
  }

  // Inserted only now, holding the score rows, so `seq` follows the order
  // the model was updated in.
  await tx.insert(schema.judgingVotes).values(votes);
  await tx
    .insert(schema.judgeReliability)
    .values(reliabilities)
    .onConflictDoUpdate({
      target: [schema.judgeReliability.judgeId, schema.judgeReliability.criterionId],
      set: {
        alpha: sql`excluded.alpha`,
        beta: sql`excluded.beta`,
      },
    });
  // Every row exists (inserted above), so this only ever updates.
  await tx
    .insert(schema.submissionScores)
    .values(scores)
    .onConflictDoUpdate({
      target: [schema.submissionScores.submissionId, schema.submissionScores.criterionId],
      set: {
        mu: sql`excluded.mu`,
        sigmaSq: sql`excluded.sigma_sq`,
      },
    });
}

/**
 * Projects that count for results: published at the submission deadline and
 * not deactivated. Publishing freezes at the deadline, so from then on "is
 * published" is exactly "was published at close"; before it, the set is
 * provisional.
 */
export async function loadResultsPool(eventId: string): Promise<
  {
    id: string;
    title: string;
    tableSlot: number | null;
    placement: number | null;
  }[]
> {
  return db
    .select({
      id: schema.submissions.id,
      title: schema.submissions.title,
      tableSlot: schema.submissions.tableSlot,
      placement: schema.submissions.placement,
    })
    .from(schema.submissions)
    .where(and(eq(schema.submissions.eventId, eventId), inPoolCondition()));
}

/**
 * Replays every in-pool vote of the event, in the order they were applied to
 * the online model (`judging_votes.seq`).
 */
export async function replayEventVotes(
  eventId: string,
  poolIds: ReadonlySet<string>,
  criterionIds: readonly string[],
): Promise<ReplayResult> {
  const votes = await db
    .select({
      judgeId: schema.judgingVotes.judgeId,
      criterionId: schema.judgingVotes.criterionId,
      winnerId: schema.judgingVotes.winnerSubmissionId,
      loserId: schema.judgingVotes.loserSubmissionId,
    })
    .from(schema.judgingVotes)
    .innerJoin(schema.judgingCriteria, eq(schema.judgingCriteria.id, schema.judgingVotes.criterionId))
    .where(eq(schema.judgingCriteria.eventId, eventId))
    .orderBy(asc(schema.judgingVotes.seq));
  return replayVotes(votes, poolIds, criterionIds);
}

/** Headline numbers for the event dashboard's judging tiles. */
export async function getJudgingTileCounts(eventId: string): Promise<{
  judges: number;
  votes: number;
  /** Published and not deactivated — the projects judges are sent to. */
  judgedProjects: number;
}> {
  const [row] = await db.execute<{
    judges: number;
    votes: number;
    judged_projects: number;
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM ${schema.eventJudges} WHERE event_id = ${eventId}) AS judges,
      (SELECT count(*)::int
         FROM ${schema.judgingVotes} v
         JOIN ${schema.judgingCriteria} c ON c.id = v.criterion_id
        WHERE c.event_id = ${eventId}) AS votes,
      (SELECT count(*)::int FROM ${schema.submissions}
        WHERE event_id = ${eventId}
          AND published
          AND deactivated_at IS NULL) AS judged_projects
  `);
  return {
    judges: Number(row?.judges ?? 0),
    votes: Number(row?.votes ?? 0),
    judgedProjects: Number(row?.judged_projects ?? 0),
  };
}
