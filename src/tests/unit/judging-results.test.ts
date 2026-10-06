import { describe, expect, it } from 'vitest';

import { JUDGE_PRIOR, PROJECT_PRIOR, update } from '@/lib/judging/crowd-bt';
import {
  overallScore,
  reliabilityMean,
  replayVotes,
  type ReplayVote,
} from '@/lib/judging/results';

const vote = (
  judgeId: string,
  criterionId: string,
  winnerId: string,
  loserId: string,
): ReplayVote => ({ judgeId, criterionId, winnerId, loserId });

describe('replayVotes', () => {
  it('starts every pool project at the prior', () => {
    const { byCriterion } = replayVotes([], new Set(['a', 'b']), ['c1']);
    expect(byCriterion.get('c1')!.get('a')).toEqual({
      ...PROJECT_PRIOR,
      comparisons: 0,
    });
  });

  it('applies a vote exactly as one Crowd-BT update', () => {
    const { byCriterion, reliability, votesByJudge } = replayVotes(
      [vote('j', 'c1', 'a', 'b')],
      new Set(['a', 'b']),
      ['c1'],
    );
    const expected = update(JUDGE_PRIOR, PROJECT_PRIOR, PROJECT_PRIOR);
    expect(byCriterion.get('c1')!.get('a')).toEqual({
      ...expected.winner,
      comparisons: 1,
    });
    expect(byCriterion.get('c1')!.get('b')).toEqual({
      ...expected.loser,
      comparisons: 1,
    });
    expect(reliability.get('j')!.get('c1')).toEqual(expected.judge);
    expect(votesByJudge.get('j')).toBe(1);
  });

  it('keeps criteria independent', () => {
    const { byCriterion } = replayVotes(
      [vote('j', 'c1', 'a', 'b'), vote('j', 'c2', 'b', 'a')],
      new Set(['a', 'b']),
      ['c1', 'c2'],
    );
    expect(byCriterion.get('c1')!.get('a')!.mu).toBeGreaterThan(0);
    expect(byCriterion.get('c2')!.get('a')!.mu).toBeLessThan(0);
  });

  it('ignores votes involving projects outside the pool, as if never cast', () => {
    const withExcluded = replayVotes(
      [
        vote('j', 'c1', 'x', 'a'),
        vote('j', 'c1', 'a', 'b'),
        vote('k', 'c1', 'b', 'x'),
      ],
      new Set(['a', 'b']),
      ['c1'],
    );
    const clean = replayVotes(
      [vote('j', 'c1', 'a', 'b')],
      new Set(['a', 'b']),
      ['c1'],
    );
    expect(withExcluded.byCriterion).toEqual(clean.byCriterion);
    expect(withExcluded.reliability).toEqual(clean.reliability);
    expect(withExcluded.votesByJudge.get('k')).toBeUndefined();
  });

  it('ignores votes on criteria it was not asked about', () => {
    const { byCriterion, votesByJudge } = replayVotes(
      [vote('j', 'gone', 'a', 'b')],
      new Set(['a', 'b']),
      ['c1'],
    );
    expect(byCriterion.get('c1')!.get('a')!.comparisons).toBe(0);
    expect(votesByJudge.size).toBe(0);
  });
});

describe('overallScore', () => {
  const byCriterion = new Map([
    ['design', new Map([['a', { mu: 1, sigmaSq: 1, comparisons: 1 }]])],
    ['tech', new Map([['a', { mu: -1, sigmaSq: 1, comparisons: 1 }]])],
  ]);

  it('is the weighted mean of per-criterion μ', () => {
    expect(
      overallScore(
        byCriterion,
        [
          { id: 'design', weight: 3 },
          { id: 'tech', weight: 1 },
        ],
        'a',
      ),
    ).toBeCloseTo(0.5, 12);
  });

  it('falls back to an unweighted mean when every weight is zero', () => {
    expect(
      overallScore(
        byCriterion,
        [
          { id: 'design', weight: 0 },
          { id: 'tech', weight: 0 },
        ],
        'a',
      ),
    ).toBeCloseTo(0, 12);
  });
});

describe('reliabilityMean', () => {
  it('is the Beta mean', () => {
    expect(reliabilityMean({ alpha: 3, beta: 1 })).toBe(0.75);
  });
});
