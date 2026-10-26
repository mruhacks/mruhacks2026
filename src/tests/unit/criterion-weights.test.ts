import { describe, expect, test } from 'vitest';

import * as Judging from '@/lib/judging';

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

describe('criterionWeightsSumToOne', () => {
  test('accepts sums within the tolerance, float noise included', () => {
    expect(Judging.criterionWeightsSumToOne([0.4, 0.6])).toBe(true);
    expect(Judging.criterionWeightsSumToOne([0.1, 0.2, 0.7])).toBe(true);
    expect(Judging.criterionWeightsSumToOne([0.333, 0.333, 0.333])).toBe(true);
    expect(Judging.criterionWeightsSumToOne([0.33, 0.33, 0.33])).toBe(false);
    expect(Judging.criterionWeightsSumToOne([0.5, 0.6])).toBe(false);
    expect(Judging.criterionWeightsSumToOne([])).toBe(false);
  });
});

describe('normalizeWeights', () => {
  test('rescales to shares of the total', () => {
    expect(Judging.normalizeWeights([1, 3])).toEqual([0.25, 0.75]);
    expect(Judging.normalizeWeights([0.25, 0.75])).toEqual([0.25, 0.75]);
  });

  test('zero total weight splits evenly', () => {
    expect(Judging.normalizeWeights([0, 0])).toEqual([0.5, 0.5]);
    expect(Judging.normalizeWeights([])).toEqual([]);
  });
});

describe('roundedWeights', () => {
  test('three decimals that add up to exactly 1', () => {
    for (const weights of [[1, 1, 1], [1, 1, 1, 1, 1, 1], [1, 2, 4], [1]]) {
      const rounded = Judging.roundedWeights(weights);
      expect(Math.round(sum(rounded) * 1000)).toBe(1000);
      expect(Judging.criterionWeightsSumToOne(rounded)).toBe(true);
      expect(rounded.map(Judging.formatWeight).every((s) => s.length <= 5)).toBe(true);
    }
    expect(Judging.roundedWeights([1, 3])).toEqual([0.25, 0.75]);
  });

  test('blank or zero weights split evenly', () => {
    expect(Judging.roundedWeights([0, 0, 0, 0])).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(Judging.roundedWeights([])).toEqual([]);
  });
});
