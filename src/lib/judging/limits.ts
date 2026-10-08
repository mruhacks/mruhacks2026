/** Input limits shared by the judging forms and the actions that validate them. */

export const JUDGE_NOTE_MAX_LENGTH = 5000;
export const CRITERION_NAME_MAX_LENGTH = 100;
export const CRITERION_DESCRIPTION_MAX_LENGTH = 300;
export const MAX_CRITERIA = 20;
export const MAX_PLACEMENT = 999;

/**
 * Criterion weights are fractions that must add up to 1, give or take this
 * much (so 0.333 × 3 passes; 0.33 × 3 doesn't). Saving stores
 * them rescaled to sum to exactly 1.
 */
export const CRITERION_WEIGHT_SUM_TOLERANCE = 0.001;

export function criterionWeightsSumToOne(weights: readonly number[]): boolean {
  const sum = weights.reduce((total, w) => total + w, 0);
  // The epsilon lets 0.333 + 0.333 + 0.333 through despite float rounding.
  return Math.abs(sum - 1) <= CRITERION_WEIGHT_SUM_TOLERANCE + 1e-9;
}

/** A weight or weight sum as shown in the criteria table: "0.4", "0.333". */
export function formatWeight(weight: number): string {
  return String(Math.round(weight * 1000) / 1000);
}

/**
 * `weights` rescaled to add up to exactly 1 at three decimals, for the
 * criteria table: what it shows for stored weights and what "Normalize" fills
 * in. Rounding drift goes on the largest weight. Zero (or no valid) total
 * weight splits evenly.
 */
export function roundedWeights(weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const clamped = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = clamped.reduce((sum, w) => sum + w, 0);
  const shares = clamped.map((w) =>
    total > 0 ? w / total : 1 / clamped.length,
  );
  const thousandths = shares.map((share) => Math.round(share * 1000));
  const drift = 1000 - thousandths.reduce((sum, t) => sum + t, 0);
  const largest = thousandths.indexOf(Math.max(...thousandths));
  thousandths[largest] += drift;
  return thousandths.map((t) => t / 1000);
}
