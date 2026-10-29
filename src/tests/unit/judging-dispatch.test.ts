import { describe, expect, it } from 'vitest';

import * as Judging from '@/lib/judging';

const CRITERIA = ['design', 'tech'];
/** Views every project gets before information gain decides (Gavel's MIN_VIEWS). */
const MIN_VIEWS = 2;

function candidate(
  id: string,
  overrides: Partial<Omit<Judging.DispatchCandidate, 'estimates'>> & {
    estimates?: Record<string, Judging.ProjectEstimate>;
  } = {},
): Judging.DispatchCandidate {
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

/** Every project a first assignment could land on, across a spread of random rolls. */
function reachable(candidates: Judging.DispatchCandidate[]): string[] {
  const ids = new Set<string>();
  for (const roll of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
    const next = Judging.chooseNext({
      candidates,
      criterionIds: CRITERIA,
      previous: null,
      reliability: new Map(),
      random: sequence(roll),
    });
    if (next) ids.add(next);
  }
  return [...ids].sort();
}

describe('which projects a judge can be sent to', () => {
  it('drops projects another judge is at', () => {
    expect(reachable([candidate('a', { busy: true }), candidate('b')])).toEqual(['b']);
  });

  it('falls back to busy projects when every project is busy', () => {
    expect(reachable([candidate('a', { busy: true }), candidate('b', { busy: true })])).toEqual(['a', 'b']);
  });

  it('prefers projects below the minimum view count', () => {
    expect(
      reachable([
        candidate('a', { views: MIN_VIEWS }),
        candidate('b', { views: 0 }),
        candidate('c', { views: MIN_VIEWS - 1 }),
      ]),
    ).toEqual(['b', 'c']);
  });

  it('applies the busy filter before the view-count filter', () => {
    expect(
      reachable([candidate('under-seen-but-busy', { views: 0, busy: true }), candidate('free', { views: MIN_VIEWS })]),
    ).toEqual(['free']);
  });
});

describe('chooseNext', () => {
  it('returns null when there is nothing to send the judge to', () => {
    expect(
      Judging.chooseNext({
        candidates: [],
        criterionIds: CRITERIA,
        previous: null,
        reliability: new Map(),
      }),
    ).toBeNull();
  });

  it('picks at random for a first assignment', () => {
    const next = Judging.chooseNext({
      candidates: [candidate('a'), candidate('b')],
      criterionIds: CRITERIA,
      previous: null,
      reliability: new Map(),
      random: sequence(0),
    });
    expect(['a', 'b']).toContain(next);
  });

  it('maximizes summed information gain when not exploring', () => {
    const previous = { estimates: new Map<string, Judging.ProjectEstimate>() };
    const settled = { mu: 6, sigmaSq: 0.01 };
    const next = Judging.chooseNext({
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
    const pick = (first: Judging.ProjectEstimate, second: Judging.ProjectEstimate) =>
      Judging.chooseNext({
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

  it('sums information gain across every criterion', () => {
    const settled = { mu: 6, sigmaSq: 0.01 };
    const next = Judging.chooseNext({
      // Equal on design; only counting tech separates them, and a tie would
      // go to the shuffled head, `both-settled`.
      candidates: [
        candidate('both-settled', { estimates: { design: settled, tech: settled } }),
        candidate('design-settled', { estimates: { design: settled } }),
      ],
      criterionIds: CRITERIA,
      previous: { estimates: new Map() },
      reliability: new Map(),
      // The shuffle keeps the order; 0.99 ≥ EPSILON: exploit.
      random: sequence(0.99),
    });
    expect(next).toBe('design-settled');
  });

  it('explores with probability epsilon', () => {
    const previous = { estimates: new Map<string, Judging.ProjectEstimate>() };
    const settled = { mu: 6, sigmaSq: 0.01 };
    // Shuffle with j = 0 swaps the two, so `settled` comes first; then the
    // epsilon roll (0) explores and returns the shuffled head.
    const next = Judging.chooseNext({
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
