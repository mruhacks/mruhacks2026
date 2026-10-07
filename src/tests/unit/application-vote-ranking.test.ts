import { describe, expect, test } from 'vitest';

import {
  orderWaitlist,
  planReviewTransitions,
  wilsonLowerBound,
  type VoteTally,
  type WaitlistCandidate,
} from '@/lib/application-vote-ranking';
import type { ParticipationStatus } from '@/types/lookups';

const p = (
  participantId: string,
  status: ParticipationStatus = 'waitlisted',
  teamId: string | null = null,
): WaitlistCandidate => ({ participantId, status, teamId });

/** Plan the status changes, apply them, then order — as the server does. */
function plan(
  participants: WaitlistCandidate[],
  tallies: Record<string, VoteTally>,
  options?: { demoteGroupOf?: string },
) {
  const map = new Map(Object.entries(tallies));
  const { promote, demote } = planReviewTransitions(participants, map, options);
  const after = participants.map((x) => ({
    ...x,
    status: promote.includes(x.participantId)
      ? ('waitlisted' as const)
      : demote.includes(x.participantId)
        ? ('pending_review' as const)
        : x.status,
  }));
  return { promote, demote, queue: orderWaitlist(after, map) };
}

describe('wilsonLowerBound', () => {
  test('is 0 with no votes and rises with evidence at the same ratio', () => {
    expect(wilsonLowerBound({ yes: 0, no: 0 })).toBe(0);
    expect(wilsonLowerBound({ yes: 10, no: 0 })).toBeGreaterThan(
      wilsonLowerBound({ yes: 1, no: 0 }),
    );
  });

  test('ranks 9 of 10 above a lone 1 of 1', () => {
    expect(wilsonLowerBound({ yes: 9, no: 1 })).toBeGreaterThan(
      wilsonLowerBound({ yes: 1, no: 0 }),
    );
  });
});

describe('planWaitlist', () => {
  test('orders the queue by Wilson score', () => {
    expect(
      plan([p('lone'), p('many'), p('weak')], {
        lone: { yes: 1, no: 0 },
        many: { yes: 9, no: 1 },
        weak: { yes: 1, no: 3 },
      }).queue,
    ).toEqual(['many', 'lone', 'weak']);
  });

  test('promotes pending applicants with a yes, not those with only noes', () => {
    const result = plan(
      [p('yes', 'pending_review'), p('no', 'pending_review')],
      {
        yes: { yes: 1, no: 2 },
        no: { yes: 0, no: 1 },
      },
    );
    expect(result.promote).toEqual(['yes']);
    expect(result.queue).toEqual(['yes']);
  });

  test('keeps current order for equal scores, unvoted entries last', () => {
    expect(
      plan([p('x'), p('a'), p('b')], {
        a: { yes: 2, no: 1 },
        b: { yes: 2, no: 1 },
      }).queue,
    ).toEqual(['a', 'b', 'x']);
  });

  test('drags pending teammates along and ranks the team by its best member', () => {
    const result = plan(
      [
        p('solo', 'waitlisted'),
        p('weak', 'pending_review', 't'),
        p('star', 'pending_review', 't'),
        p('quiet', 'pending_review', 't'),
      ],
      {
        solo: { yes: 3, no: 1 },
        weak: { yes: 0, no: 4 },
        star: { yes: 6, no: 0 },
      },
    );
    expect(result.promote).toEqual(['weak', 'star', 'quiet']);
    expect(result.queue).toEqual(['weak', 'star', 'quiet', 'solo']);
  });

  test('never drags a "Denied" teammate, and ignores their votes', () => {
    const result = plan(
      [
        p('denied', 'denied', 't'),
        p('mate', 'pending_review', 't'),
        p('other', 'pending_review', 'u'),
        p('backer', 'pending_review', 'u'),
      ],
      {
        denied: { yes: 5, no: 0 },
        other: { yes: 1, no: 0 },
      },
    );
    // Team t's only yes is from its denied member, so it doesn't qualify.
    expect(result.promote).toEqual(['other', 'backer']);
    expect(result.queue).not.toContain('denied');
  });

  test('a team that lost its last yes is demoted when asked', () => {
    const participants = [p('a', 'waitlisted', 't'), p('b', 'waitlisted', 't')];
    expect(
      plan(participants, { a: { yes: 0, no: 1 } }, { demoteGroupOf: 'a' }),
    ).toEqual({ promote: [], demote: ['a', 'b'], queue: [] });
    // Without the hint, hand-waitlisted entries are left alone.
    expect(plan(participants, { a: { yes: 0, no: 1 } }).demote).toEqual([]);
  });

  test('no demotion while the group still has a yes', () => {
    expect(
      plan(
        [p('a', 'waitlisted', 't'), p('b', 'waitlisted', 't')],
        { b: { yes: 1, no: 0 } },
        { demoteGroupOf: 'a' },
      ).demote,
    ).toEqual([]);
  });
});
