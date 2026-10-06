/**
 * Which project a judge should walk to next.
 *
 * Ported from Gavel's `preferred_items` / `choose_next` in
 * `gavel/controllers/judge.py` by Anish Athalye:
 * https://github.com/anishathalye/gavel/blob/master/gavel/controllers/judge.py
 * Gavel is licensed under the GNU Affero General Public License v3.0, and so
 * is this file (see LICENSE at the repo root).
 *
 * Differences from Gavel: every comparison is scored on several criteria, each
 * its own Crowd-BT model, so the information gain of a candidate is summed
 * across criteria; and Gavel's "prioritized" items are out of scope.
 *
 * Pure: the caller loads the state and passes in the randomness.
 */

import {
  EPSILON,
  JUDGE_PRIOR,
  PROJECT_PRIOR,
  expectedInformationGain,
  type JudgeReliability,
  type ProjectEstimate,
} from './crowd-bt';

/** Gavel's MIN_VIEWS: judges see every project this many times before gain decides. */
export const MIN_VIEWS = 2;
/** Gavel's TIMEOUT: how long an assignment keeps a project off other judges' lists. */
export const BUSY_WINDOW_MS = 5 * 60 * 1000;

export type DispatchCandidate = {
  id: string;
  /** Distinct judges who have looked at it (voted on it, or begun on it). */
  views: number;
  /** Assigned to another judge within the busy window. */
  busy: boolean;
  /** Per criterion id; a missing entry is the prior. */
  estimates: ReadonlyMap<string, ProjectEstimate>;
};

export type DispatchInput = {
  /** Already filtered to the pool, minus everything this judge must not see. */
  candidates: readonly DispatchCandidate[];
  criterionIds: readonly string[];
  /** The project the judge is coming from; null when they haven't begun. */
  previous: {
    estimates: ReadonlyMap<string, ProjectEstimate>;
  } | null;
  /** Per criterion id; a missing entry is the prior. */
  reliability: ReadonlyMap<string, JudgeReliability>;
  /** Uniform [0, 1), injectable for tests. */
  random?: () => number;
};

/**
 * Gavel's preference order: prefer projects nobody else is at, then among
 * those, projects below the minimum view count. Each filter is skipped when
 * it would leave nothing.
 */
export function preferredCandidates(
  candidates: readonly DispatchCandidate[],
): DispatchCandidate[] {
  const nonBusy = candidates.filter((c) => !c.busy);
  const preferred = nonBusy.length > 0 ? nonBusy : [...candidates];
  const lessSeen = preferred.filter((c) => c.views < MIN_VIEWS);
  return lessSeen.length > 0 ? lessSeen : preferred;
}

/** Information gain of comparing `previous` with `candidate`, summed across criteria. */
export function summedInformationGain(
  criterionIds: readonly string[],
  reliability: ReadonlyMap<string, JudgeReliability>,
  previous: ReadonlyMap<string, ProjectEstimate>,
  candidate: ReadonlyMap<string, ProjectEstimate>,
): number {
  let total = 0;
  for (const id of criterionIds) {
    total += expectedInformationGain(
      reliability.get(id) ?? JUDGE_PRIOR,
      previous.get(id) ?? PROJECT_PRIOR,
      candidate.get(id) ?? PROJECT_PRIOR,
    );
  }
  return total;
}

/** The next project id, or null when nothing is left to send them to. */
export function chooseNext(input: DispatchInput): string | null {
  const random = input.random ?? Math.random;
  const items = shuffle(preferredCandidates(input.candidates), random);
  if (items.length === 0) return null;

  // A first assignment has nothing to compare against: Gavel picks at random.
  if (!input.previous || random() < EPSILON) return items[0].id;

  // Shuffled first, so ties break randomly — as in Gavel.
  let best = items[0];
  let bestGain = -Infinity;
  for (const item of items) {
    const gain = summedInformationGain(
      input.criterionIds,
      input.reliability,
      input.previous.estimates,
      item.estimates,
    );
    if (gain > bestGain) {
      best = item;
      bestGain = gain;
    }
  }
  return best.id;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
