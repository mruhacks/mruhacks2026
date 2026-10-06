import 'server-only';

import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';

import {
  eventJudges,
  events,
  judgeReliability,
  judgeSkips,
  judgeState,
  judgingCriteria,
  judgingVotes,
  submissionScores,
  submissions,
  user,
} from '@/db/schema';
import type { Queryable } from '@/lib/team-membership';
import { db } from '@/utils/db';

import {
  JUDGE_PRIOR,
  PROJECT_PRIOR,
  update,
  type JudgeReliability,
  type ProjectEstimate,
} from './crowd-bt';
import { BUSY_WINDOW_MS, chooseNext, type DispatchCandidate } from './dispatch';
import { replayVotes, type ReplayResult } from './results';

/**
 * Database side of expo judging: who is a judge, what's in the pool, where to
 * send a judge next, and the online model updates. The math lives in the pure
 * modules next to this one.
 */

/** A judge who skipped a project as "Team not here" may be sent back after this. */
const NOT_HERE_RETRY_MS = 10 * 60 * 1000;

export type JudgeRow = typeof eventJudges.$inferSelect;

type JudgingEvent = {
  startsAt: Date | null;
  endsAt: Date | null;
};

/** Judging runs from the event's start to its end; no admin controls. */
export function getJudgingWindow(
  event: JudgingEvent,
  now: Date = new Date(),
): 'not_open' | 'open' | 'closed' {
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
function rosterMatch(user: { id: string; email: string }) {
  return or(
    eq(eventJudges.userId, user.id),
    and(
      isNull(eventJudges.userId),
      eq(eventJudges.email, normalizeJudgeEmail(user.email)),
    ),
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
    .from(eventJudges)
    .where(and(eq(eventJudges.eventId, eventId), rosterMatch(user)))
    // A linked row wins over an unlinked one for the same event.
    .orderBy(sql`${eventJudges.userId} IS NULL`)
    .limit(1);
  return row ?? null;
}

/** Every event whose roster the user is on. */
export async function listJudgeEventsForUser(user: {
  id: string;
  email: string;
}): Promise<
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
      eventId: events.id,
      name: events.name,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      disabledAt: eventJudges.disabledAt,
    })
    .from(eventJudges)
    .innerJoin(events, eq(events.id, eventJudges.eventId))
    .where(rosterMatch(user))
    .orderBy(asc(events.startsAt), asc(events.name));
  return rows.map(({ disabledAt, ...row }) => ({
    ...row,
    disabled: disabledAt != null,
  }));
}

/** On any roster at all — decides the judge onboarding path. */
export async function isOnAnyJudgeRoster(user: {
  id: string;
  email: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: eventJudges.id })
    .from(eventJudges)
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
    UPDATE ${eventJudges} AS ej
       SET user_id = u.id
      FROM ${user} u
     WHERE u.id = ${userId}
       AND ej.user_id IS NULL
       AND ej.email = lower(u.email)
       AND NOT EXISTS (
         SELECT 1 FROM ${eventJudges} other
          WHERE other.event_id = ej.event_id AND other.user_id = u.id
       )
  `);
}

/** Criteria in display order. */
export async function loadCriteria(
  eventId: string,
  dbHandle: Queryable = db,
): Promise<(typeof judgingCriteria.$inferSelect)[]> {
  return dbHandle
    .select()
    .from(judgingCriteria)
    .where(eq(judgingCriteria.eventId, eventId))
    .orderBy(asc(judgingCriteria.position), asc(judgingCriteria.createdAt));
}

/** Once any vote exists, criteria can only be renamed or reweighted. */
export async function eventHasVotes(
  eventId: string,
  dbHandle: Queryable = db,
): Promise<boolean> {
  const [row] = await dbHandle
    .select({ id: judgingVotes.id })
    .from(judgingVotes)
    .innerJoin(
      judgingCriteria,
      eq(judgingCriteria.id, judgingVotes.criterionId),
    )
    .where(eq(judgingCriteria.eventId, eventId))
    .limit(1);
  return row != null;
}

/**
 * submission id → table number: 1-based rank by `(created_at, id)` among
 * *all* of the event's submissions, drafts included. Derived, never stored;
 * ranked in SQL so microsecond timestamps order exactly as Postgres sees them.
 */
export async function getTableNumbers(
  eventId: string,
  dbHandle: Pick<typeof db, 'execute'> = db,
): Promise<Map<string, number>> {
  const rows = await dbHandle.execute<{ id: string; table_number: number }>(sql`
    SELECT id, row_number() OVER (ORDER BY created_at, id)::int AS table_number
      FROM ${submissions}
     WHERE event_id = ${eventId}
  `);
  return new Map(rows.map((row) => [row.id, Number(row.table_number)]));
}

/** Projects judges can be sent to: published and not deactivated. */
export function inPoolCondition() {
  return and(
    eq(submissions.published, true),
    isNull(submissions.deactivatedAt),
  );
}

async function loadPoolIds(
  eventId: string,
  dbHandle: Queryable,
): Promise<Set<string>> {
  const rows = await dbHandle
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.eventId, eventId), inPoolCondition()));
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
    .from(submissionScores)
    .where(inArray(submissionScores.submissionId, submissionIds));
  for (const row of rows) {
    const map = out.get(row.submissionId) ?? new Map();
    map.set(row.criterionId, { mu: row.mu, sigmaSq: row.sigmaSq });
    out.set(row.submissionId, map);
  }
  return out;
}

async function loadReliability(
  judgeId: string,
  dbHandle: Queryable,
): Promise<Map<string, JudgeReliability>> {
  const rows = await dbHandle
    .select()
    .from(judgeReliability)
    .where(eq(judgeReliability.judgeId, judgeId));
  return new Map(
    rows.map((row) => [row.criterionId, { alpha: row.alpha, beta: row.beta }]),
  );
}

/**
 * Projects this judge must not be sent to: everything they've compared or
 * begun on, conflicts of interest, and "not here" skips still inside the
 * retry window.
 */
async function loadExcludedForJudge(
  judgeId: string,
  previousId: string | null,
  now: Date,
  dbHandle: Queryable,
): Promise<Set<string>> {
  const [voted, skipped] = await Promise.all([
    dbHandle
      .select({
        winner: judgingVotes.winnerSubmissionId,
        loser: judgingVotes.loserSubmissionId,
      })
      .from(judgingVotes)
      .where(eq(judgingVotes.judgeId, judgeId)),
    dbHandle
      .select({ submissionId: judgeSkips.submissionId })
      .from(judgeSkips)
      .where(
        and(
          eq(judgeSkips.judgeId, judgeId),
          or(
            eq(judgeSkips.reason, 'conflict'),
            gt(
              judgeSkips.createdAt,
              new Date(now.getTime() - NOT_HERE_RETRY_MS),
            ),
          ),
        ),
      ),
  ]);
  const excluded = new Set<string>();
  for (const row of voted) {
    excluded.add(row.winner);
    excluded.add(row.loser);
  }
  for (const row of skipped) excluded.add(row.submissionId);
  if (previousId) excluded.add(previousId);
  return excluded;
}

/** submission id → distinct judges who have looked at it (voted on it or begun on it). */
async function loadViewCounts(
  eventId: string,
  dbHandle: Pick<typeof db, 'execute'>,
): Promise<Map<string, number>> {
  const rows = await dbHandle.execute<{
    submission_id: string;
    views: number;
  }>(sql`
    SELECT seen.submission_id, count(DISTINCT seen.judge_id)::int AS views
      FROM (
        SELECT v.judge_id, v.winner_submission_id AS submission_id
          FROM ${judgingVotes} v
          JOIN ${judgingCriteria} c ON c.id = v.criterion_id
         WHERE c.event_id = ${eventId}
        UNION
        SELECT v.judge_id, v.loser_submission_id
          FROM ${judgingVotes} v
          JOIN ${judgingCriteria} c ON c.id = v.criterion_id
         WHERE c.event_id = ${eventId}
        UNION
        SELECT s.judge_id, s.previous_submission_id
          FROM ${judgeState} s
          JOIN ${eventJudges} j ON j.id = s.judge_id
         WHERE j.event_id = ${eventId} AND s.previous_submission_id IS NOT NULL
      ) seen
     GROUP BY seen.submission_id
  `);
  return new Map(rows.map((row) => [row.submission_id, Number(row.views)]));
}

/** Projects another active judge was sent to within the busy window. */
async function loadBusyIds(
  eventId: string,
  judgeId: string,
  now: Date,
  dbHandle: Queryable,
): Promise<Set<string>> {
  const rows = await dbHandle
    .select({ submissionId: judgeState.currentSubmissionId })
    .from(judgeState)
    .innerJoin(eventJudges, eq(eventJudges.id, judgeState.judgeId))
    .where(
      and(
        eq(eventJudges.eventId, eventId),
        ne(judgeState.judgeId, judgeId),
        isNull(eventJudges.disabledAt),
        isNotNull(judgeState.currentSubmissionId),
        gt(judgeState.assignedAt, new Date(now.getTime() - BUSY_WINDOW_MS)),
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
    previous: options.previousId
      ? { estimates: estimates.get(options.previousId) ?? new Map() }
      : null,
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
    .insert(submissionScores)
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
    SELECT 1 FROM ${submissionScores}
     WHERE submission_id IN (${sql.join(
       pair.map((id) => sql`${id}`),
       sql`, `,
     )})
     ORDER BY submission_id, criterion_id
       FOR UPDATE
  `);

  const [estimates, reliability] = await Promise.all([
    loadEstimates(pair, tx),
    loadReliability(options.judgeId, tx),
  ]);

  for (const [criterionId, side] of options.winners) {
    const winnerId =
      side === 'current' ? options.currentId : options.previousId;
    const loserId = side === 'current' ? options.previousId : options.currentId;
    const result = update(
      reliability.get(criterionId) ?? JUDGE_PRIOR,
      estimates.get(winnerId)?.get(criterionId) ?? PROJECT_PRIOR,
      estimates.get(loserId)?.get(criterionId) ?? PROJECT_PRIOR,
    );

    await tx.insert(judgingVotes).values({
      judgeId: options.judgeId,
      criterionId,
      winnerSubmissionId: winnerId,
      loserSubmissionId: loserId,
    });
    await tx
      .insert(judgeReliability)
      .values({ judgeId: options.judgeId, criterionId, ...result.judge })
      .onConflictDoUpdate({
        target: [judgeReliability.judgeId, judgeReliability.criterionId],
        set: result.judge,
      });
    for (const [submissionId, estimate] of [
      [winnerId, result.winner],
      [loserId, result.loser],
    ] as const) {
      await tx
        .update(submissionScores)
        .set(estimate)
        .where(
          and(
            eq(submissionScores.submissionId, submissionId),
            eq(submissionScores.criterionId, criterionId),
          ),
        );
    }
  }
}

/**
 * Projects that count for results: published at the submission deadline and
 * not deactivated. Publishing freezes at the deadline, so from then on "is
 * published" is exactly "was published at close"; before it, the set is
 * provisional.
 */
export async function loadResultsPool(
  eventId: string,
): Promise<
  { id: string; title: string; finalist: boolean; placement: number | null }[]
> {
  return db
    .select({
      id: submissions.id,
      title: submissions.title,
      finalist: submissions.finalist,
      placement: submissions.placement,
    })
    .from(submissions)
    .where(and(eq(submissions.eventId, eventId), inPoolCondition()));
}

/** Replays every in-pool vote of the event, in cast order. */
export async function replayEventVotes(
  eventId: string,
  poolIds: ReadonlySet<string>,
  criterionIds: readonly string[],
): Promise<ReplayResult> {
  const votes = await db
    .select({
      judgeId: judgingVotes.judgeId,
      criterionId: judgingVotes.criterionId,
      winnerId: judgingVotes.winnerSubmissionId,
      loserId: judgingVotes.loserSubmissionId,
    })
    .from(judgingVotes)
    .innerJoin(
      judgingCriteria,
      eq(judgingCriteria.id, judgingVotes.criterionId),
    )
    .where(eq(judgingCriteria.eventId, eventId))
    .orderBy(asc(judgingVotes.createdAt), asc(judgingVotes.id));
  return replayVotes(votes, poolIds, criterionIds);
}

/** Headline numbers for the event dashboard's judging tiles. */
export async function getJudgingTileCounts(
  eventId: string,
): Promise<{ judges: number; votes: number }> {
  const [row] = await db.execute<{ judges: number; votes: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM ${eventJudges} WHERE event_id = ${eventId}) AS judges,
      (SELECT count(*)::int
         FROM ${judgingVotes} v
         JOIN ${judgingCriteria} c ON c.id = v.criterion_id
        WHERE c.event_id = ${eventId}) AS votes
  `);
  return { judges: Number(row?.judges ?? 0), votes: Number(row?.votes ?? 0) };
}
