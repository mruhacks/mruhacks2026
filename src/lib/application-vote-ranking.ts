import type { ParticipationStatus } from '@/types/lookups';

/**
 * Pure waitlist rules from swipe-review votes. Shared by the waitlist module
 * (server) and its unit tests; no DB access here.
 *
 * Rules:
 * - Applicants are grouped by team (a solo applicant is a group of one).
 *   Members marked `denied` are ignored entirely: their votes
 *   don't count toward the group and they are never pulled onto the waitlist.
 * - A group qualifies for the waitlist once any counted member has a yes.
 *   Every `pending_review` member of a qualifying group is promoted — a team
 *   gets dragged along by its members' yeses.
 * - The waitlist is ordered by the group's best member's score: the Wilson
 *   lower bound of their yes share, so 9 of 10 outranks a lone 1 of 1. Ties go
 *   to more yeses, then to the group with the oldest application.
 * - Waitlisted applicants whose group has no votes at all (put there by hand)
 *   rank after every scored group, oldest application first.
 */

export type VoteTally = { yes: number; no: number };

type Score = { value: number; yes: number };

/** z for a 95% confidence interval. */
const Z = 1.96;

/**
 * Lower bound of the Wilson score interval for `yes` out of `yes + no` — the
 * approval rate we're 95% sure the applicant clears, which rewards a strong
 * ratio but discounts one backed by very few votes.
 */
export function wilsonLowerBound({ yes, no }: VoteTally): number {
  const n = yes + no;
  if (n === 0) return 0;
  const p = yes / n;
  const z2 = Z * Z;
  return (
    (p + z2 / (2 * n) - Z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) /
    (1 + z2 / n)
  );
}

function scoreOf(tally: VoteTally | undefined): Score | null {
  if (!tally || tally.yes + tally.no === 0) return null;
  return { value: wilsonLowerBound(tally), yes: tally.yes };
}

/** Negative when `a` ranks ahead of `b`; null (unscored) ranks last. */
function compareScores(a: Score | null, b: Score | null): number {
  if (a === null || b === null) {
    if (a === b) return 0;
    return a === null ? 1 : -1;
  }
  if (a.value !== b.value) return b.value - a.value;
  return b.yes - a.yes;
}

export type WaitlistCandidate = {
  participantId: string;
  teamId: string | null;
  status: ParticipationStatus;
};

type Groups = {
  groupOf: (p: WaitlistCandidate) => string;
  score: Map<string, Score | null>;
  qualifies: Map<string, boolean>;
  /** Index of the group's first member — the tie-breaker between groups. */
  anchor: Map<string, number>;
};

function groupParticipants(
  participants: readonly WaitlistCandidate[],
  tallies: ReadonlyMap<string, VoteTally>,
): Groups {
  const groupOf = (p: WaitlistCandidate) => p.teamId ?? p.participantId;
  const score = new Map<string, Score | null>();
  const qualifies = new Map<string, boolean>();
  const anchor = new Map<string, number>();
  participants.forEach((p, index) => {
    const group = groupOf(p);
    if (!anchor.has(group)) anchor.set(group, index);
    if (p.status === 'denied') return;

    const tally = tallies.get(p.participantId);
    const own = scoreOf(tally);
    const best = score.get(group) ?? null;
    score.set(group, compareScores(own, best) < 0 ? own : best);
    if ((tally?.yes ?? 0) > 0) qualifies.set(group, true);
  });
  return { groupOf, score, qualifies, anchor };
}

export type ReviewTransitions = {
  /** `pending_review` participants to move onto the waitlist. */
  promote: string[];
  /** `waitlisted` participants to send back to `pending_review`. */
  demote: string[];
};

/**
 * Which statuses the tally changes.
 *
 * `demoteGroupOf` names a participant whose group just lost a yes (a vote
 * undone or flipped to no): if that group no longer qualifies, its waitlisted
 * members go back to review. Demotion is never inferred otherwise, so an
 * applicant an organizer waitlisted by hand stays put.
 */
export function planReviewTransitions(
  participants: readonly WaitlistCandidate[],
  tallies: ReadonlyMap<string, VoteTally>,
  options: { demoteGroupOf?: string } = {},
): ReviewTransitions {
  const { groupOf, qualifies } = groupParticipants(participants, tallies);

  const demoteFrom = options.demoteGroupOf
    ? participants.find((p) => p.participantId === options.demoteGroupOf)
    : undefined;
  const demoteKey =
    demoteFrom && !qualifies.get(groupOf(demoteFrom))
      ? groupOf(demoteFrom)
      : null;

  const promote: string[] = [];
  const demote: string[] = [];
  for (const p of participants) {
    const group = groupOf(p);
    if (p.status === 'waitlisted' && group === demoteKey) {
      demote.push(p.participantId);
    } else if (p.status === 'pending_review' && qualifies.get(group)) {
      promote.push(p.participantId);
    }
  }
  return { promote, demote };
}

/**
 * The waitlist in queue order — derived on every read, never stored.
 *
 * `participants` is every participant in the event (teammates outside the
 * waitlist still lift their team's score), oldest application first: that
 * order is the final tie-breaker.
 */
export function orderWaitlist(
  participants: readonly WaitlistCandidate[],
  tallies: ReadonlyMap<string, VoteTally>,
): string[] {
  const { groupOf, score, anchor } = groupParticipants(participants, tallies);
  return participants
    .map((p, index) => ({ p, index, group: groupOf(p) }))
    .filter(({ p }) => p.status === 'waitlisted')
    .sort(
      (a, b) =>
        compareScores(score.get(a.group) ?? null, score.get(b.group) ?? null) ||
        anchor.get(a.group)! - anchor.get(b.group)! ||
        a.index - b.index,
    )
    .map(({ p }) => p.participantId);
}
