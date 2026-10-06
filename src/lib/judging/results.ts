/**
 * Expo judging results, computed by replaying votes through Crowd-BT.
 *
 * The online `submission_scores` state is only good enough for dispatch: it
 * has absorbed every vote, including ones about projects that were later
 * unpublished or deactivated. Results instead replay just the in-pool votes,
 * in order, from the priors — so an excluded project skews nobody's μ, σ² or
 * reliability. Pure: the caller loads votes and the pool.
 */

import {
  JUDGE_PRIOR,
  PROJECT_PRIOR,
  update,
  type JudgeReliability,
  type ProjectEstimate,
} from './crowd-bt';

export type ReplayVote = {
  judgeId: string;
  criterionId: string;
  winnerId: string;
  loserId: string;
};

export type CriterionWeight = { id: string; weight: number };

type ProjectCriterionResult = ProjectEstimate & {
  /** In-pool votes this project took part in, for this criterion. */
  comparisons: number;
};

export type ReplayResult = {
  /** criterion id → submission id → result. Every pool project has an entry. */
  byCriterion: Map<string, Map<string, ProjectCriterionResult>>;
  /** judge id → criterion id → reliability. Judges with no in-pool votes are absent. */
  reliability: Map<string, Map<string, JudgeReliability>>;
  /** judge id → in-pool votes cast, across all criteria. */
  votesByJudge: Map<string, number>;
};

/** Replays `votes` (already in cast order) over `pool`. */
export function replayVotes(
  votes: readonly ReplayVote[],
  pool: ReadonlySet<string>,
  criterionIds: readonly string[],
): ReplayResult {
  const byCriterion = new Map<string, Map<string, ProjectCriterionResult>>();
  for (const criterionId of criterionIds) {
    const projects = new Map<string, ProjectCriterionResult>();
    for (const id of pool)
      projects.set(id, { ...PROJECT_PRIOR, comparisons: 0 });
    byCriterion.set(criterionId, projects);
  }
  const reliability = new Map<string, Map<string, JudgeReliability>>();
  const votesByJudge = new Map<string, number>();

  for (const vote of votes) {
    const projects = byCriterion.get(vote.criterionId);
    if (!projects) continue;
    const winner = projects.get(vote.winnerId);
    const loser = projects.get(vote.loserId);
    // Either side outside the pool: kept in the database, ignored here.
    if (!winner || !loser) continue;

    let judge = reliability.get(vote.judgeId);
    if (!judge) {
      judge = new Map();
      reliability.set(vote.judgeId, judge);
    }
    const next = update(
      judge.get(vote.criterionId) ?? JUDGE_PRIOR,
      winner,
      loser,
    );
    judge.set(vote.criterionId, next.judge);
    projects.set(vote.winnerId, {
      ...next.winner,
      comparisons: winner.comparisons + 1,
    });
    projects.set(vote.loserId, {
      ...next.loser,
      comparisons: loser.comparisons + 1,
    });
    votesByJudge.set(vote.judgeId, (votesByJudge.get(vote.judgeId) ?? 0) + 1);
  }

  return { byCriterion, reliability, votesByJudge };
}

/**
 * The Overall score: the weighted mean of a project's per-criterion μ. Weights
 * only re-sort; they never feed back into the votes. Zero total weight falls
 * back to an unweighted mean so the table still sorts.
 */
export function overallScore(
  byCriterion: ReplayResult['byCriterion'],
  criteria: readonly CriterionWeight[],
  submissionId: string,
): number {
  const totalWeight = criteria.reduce(
    (sum, c) => sum + Math.max(c.weight, 0),
    0,
  );
  let total = 0;
  for (const criterion of criteria) {
    const mu = byCriterion.get(criterion.id)?.get(submissionId)?.mu ?? 0;
    const weight =
      totalWeight > 0
        ? Math.max(criterion.weight, 0) / totalWeight
        : 1 / criteria.length;
    total += weight * mu;
  }
  return total;
}

/** A judge's reliability as one number: the Beta mean, α / (α + β). */
export function reliabilityMean({ alpha, beta }: JudgeReliability): number {
  return alpha / (alpha + beta);
}
