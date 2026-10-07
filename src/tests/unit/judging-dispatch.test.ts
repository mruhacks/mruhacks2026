import { describe, expect, it } from 'vitest';

import {
  MIN_VIEWS,
  chooseNext,
  preferredCandidates,
  summedInformationGain,
  type DispatchCandidate,
} from '@/lib/judging/dispatch';
import type { ProjectEstimate } from '@/lib/judging/crowd-bt';

const CRITERIA = ['design', 'tech'];

function candidate(
  id: string,
  overrides: Partial<Omit<DispatchCandidate, 'estimates'>> & {
    estimates?: Record<string, ProjectEstimate>;
  } = {},
): DispatchCandidate {
  return {
    id,
    views: overrides.views ?? MIN_VIEWS,
    busy: overrides.busy ?? false,
    estimates: new Map(Object.entries(overrides.estimates ?? {})),
  };
}

/** A fixed sequence, so shuffles and the epsilon roll are deterministic. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('preferredCandidates', () => {
  it('drops projects another judge is at', () => {
    const ids = preferredCandidates([
      candidate('a', { busy: true }),
      candidate('b'),
    ]).map((c) => c.id);
    expect(ids).toEqual(['b']);
  });

  it('falls back to busy projects when every project is busy', () => {
    const ids = preferredCandidates([
      candidate('a', { busy: true }),
      candidate('b', { busy: true }),
    ]).map((c) => c.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('prefers projects below the minimum view count', () => {
    const ids = preferredCandidates([
      candidate('a', { views: MIN_VIEWS }),
      candidate('b', { views: 0 }),
      candidate('c', { views: MIN_VIEWS - 1 }),
    ]).map((c) => c.id);
    expect(ids).toEqual(['b', 'c']);
  });

  it('applies the busy filter before the view-count filter', () => {
    const ids = preferredCandidates([
      candidate('under-seen-but-busy', { views: 0, busy: true }),
      candidate('free', { views: MIN_VIEWS }),
    ]).map((c) => c.id);
    expect(ids).toEqual(['free']);
  });
});

describe('chooseNext', () => {
  it('returns null when there is nothing to send the judge to', () => {
    expect(
      chooseNext({
        candidates: [],
        criterionIds: CRITERIA,
        previous: null,
        reliability: new Map(),
      }),
    ).toBeNull();
  });

  it('picks at random for a first assignment', () => {
    const next = chooseNext({
      candidates: [candidate('a'), candidate('b')],
      criterionIds: CRITERIA,
      previous: null,
      reliability: new Map(),
      random: sequence(0),
    });
    expect(['a', 'b']).toContain(next);
  });

  it('maximizes summed information gain when not exploring', () => {
    const previous = { estimates: new Map<string, ProjectEstimate>() };
    const settled = { mu: 6, sigmaSq: 0.01 };
    const next = chooseNext({
      candidates: [
        candidate('settled', {
          estimates: { design: settled, tech: settled },
        }),
        candidate('open'),
      ],
      criterionIds: CRITERIA,
      previous,
      reliability: new Map(),
      // Shuffle rolls, then 0.99 ≥ EPSILON: exploit.
      random: sequence(0.5, 0.99),
    });
    expect(next).toBe('open');
  });

  it('breaks a tie by shuffled order, not by rounding noise', () => {
    // Mirrored around the previous project's μ, these two gain exactly the
    // same in theory, but not in floating point.
    const above = { mu: 0.40909090909090906, sigmaSq: 0.8326446280991735 };
    const below = { mu: -above.mu, sigmaSq: above.sigmaSq };
    const pick = (first: ProjectEstimate, second: ProjectEstimate) =>
      chooseNext({
        candidates: [
          candidate('first', { estimates: { design: first, tech: first } }),
          candidate('second', { estimates: { design: second, tech: second } }),
        ],
        criterionIds: CRITERIA,
        previous: { estimates: new Map() },
        reliability: new Map(),
        // The shuffle keeps the order; 0.99 ≥ EPSILON: exploit.
        random: sequence(0.99),
      });
    expect(pick(below, above)).toBe('first');
    expect(pick(above, below)).toBe('first');
  });

  it('explores with probability epsilon', () => {
    const previous = { estimates: new Map<string, ProjectEstimate>() };
    const settled = { mu: 6, sigmaSq: 0.01 };
    // Shuffle with j = 0 swaps the two, so `settled` comes first; then the
    // epsilon roll (0) explores and returns the shuffled head.
    const next = chooseNext({
      candidates: [
        candidate('open'),
        candidate('settled', {
          estimates: { design: settled, tech: settled },
        }),
      ],
      criterionIds: CRITERIA,
      previous,
      reliability: new Map(),
      random: sequence(0),
    });
    expect(next).toBe('settled');
  });
});

describe('summedInformationGain', () => {
  it('adds one term per criterion', () => {
    const one = summedInformationGain(['a'], new Map(), new Map(), new Map());
    const two = summedInformationGain(
      ['a', 'b'],
      new Map(),
      new Map(),
      new Map(),
    );
    expect(two).toBeCloseTo(2 * one, 12);
  });
});
