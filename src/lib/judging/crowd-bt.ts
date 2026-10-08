/**
 * Crowd-BT: pairwise ranking aggregation with per-judge reliability.
 *
 * Ported from Gavel's `gavel/crowd_bt.py` by Anish Athalye:
 * https://github.com/anishathalye/gavel/blob/master/gavel/crowd_bt.py
 * Gavel is licensed under the GNU Affero General Public License v3.0, and so
 * is this file (see LICENSE at the repo root).
 *
 * The model is from Chen et al., "Pairwise Ranking Aggregation in a
 * Crowdsourced Setting" (WSDM 2013):
 * http://people.stern.nyu.edu/xchen3/images/crowd_pairwise.pdf
 *
 * Each project has a Gaussian quality estimate (μ, σ²); each judge has a Beta
 * reliability (α, β) — roughly, the odds they vote the way the true ranking
 * would. Every vote updates both online. Pure functions only: no database,
 * no randomness, so the same vote sequence always yields the same state.
 */

// Gavel's defaults, "chosen according to experiments in paper".
/** Trade-off between learning about projects and learning about the judge. */
const GAMMA = 0.1;
/** Floor on the variance multiplier, so σ² stays positive. */
const KAPPA = 0.0001;
const MU_PRIOR = 0;
const SIGMA_SQ_PRIOR = 1;
export const ALPHA_PRIOR = 10;
export const BETA_PRIOR = 1;
/** Epsilon-greedy: how often dispatch explores instead of maximizing gain. */
export const EPSILON = 0.25;

export type ProjectEstimate = { mu: number; sigmaSq: number };
export type JudgeReliability = { alpha: number; beta: number };

export const PROJECT_PRIOR: Readonly<ProjectEstimate> = Object.freeze({
  mu: MU_PRIOR,
  sigmaSq: SIGMA_SQ_PRIOR,
});
export const JUDGE_PRIOR: Readonly<JudgeReliability> = Object.freeze({
  alpha: ALPHA_PRIOR,
  beta: BETA_PRIOR,
});

// ── Special functions (scipy.special.betaln / psi) ─────────────────────────

// Lanczos approximation, g = 7, n = 9: ~15 significant digits for x > 0.
const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0. */
function lnGamma(x: number): number {
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1−x) = π / sin(πx).
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  const z = x - 1;
  let sum = LANCZOS_COEFFICIENTS[0];
  for (let i = 1; i < LANCZOS_G + 2; i++) {
    sum += LANCZOS_COEFFICIENTS[i] / (z + i);
  }
  const t = z + LANCZOS_G + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum)
  );
}

/** ln |B(a, b)|, as `scipy.special.betaln`. */
export function betaln(a: number, b: number): number {
  return lnGamma(a) + lnGamma(b) - lnGamma(a + b);
}

/** The digamma function ψ(x) for x > 0, as `scipy.special.psi`. */
export function psi(x: number): number {
  let result = 0;
  // Recurrence ψ(x) = ψ(x+1) − 1/x until the asymptotic series is accurate.
  while (x < 6) {
    result -= 1 / x;
    x += 1;
  }
  const inv = 1 / x;
  const inv2 = inv * inv;
  return (
    result +
    Math.log(x) -
    0.5 * inv -
    inv2 *
      (1 / 12 -
        inv2 *
          (1 / 120 - inv2 * (1 / 252 - inv2 * (1 / 240 - inv2 * (1 / 132)))))
  );
}

// ── Divergences ────────────────────────────────────────────────────────────

/** KL divergence between two Gaussians. */
function divergenceGaussian(
  mu1: number,
  sigmaSq1: number,
  mu2: number,
  sigmaSq2: number,
): number {
  const ratio = sigmaSq1 / sigmaSq2;
  return (mu1 - mu2) ** 2 / (2 * sigmaSq2) + (ratio - 1 - Math.log(ratio)) / 2;
}

/** KL divergence between two Beta distributions. */
function divergenceBeta(
  alpha1: number,
  beta1: number,
  alpha2: number,
  beta2: number,
): number {
  return (
    betaln(alpha2, beta2) -
    betaln(alpha1, beta1) +
    (alpha1 - alpha2) * psi(alpha1) +
    (beta1 - beta2) * psi(beta1) +
    (alpha2 - alpha1 + beta2 - beta1) * psi(alpha1 + beta1)
  );
}

// ── Update ─────────────────────────────────────────────────────────────────

export type UpdateResult = {
  judge: JudgeReliability;
  winner: ProjectEstimate;
  loser: ProjectEstimate;
};

/**
 * One vote: `judge` preferred `winner` over `loser`. Returns the updated
 * judge reliability and both projects' estimates.
 */
export function update(
  judge: JudgeReliability,
  winner: ProjectEstimate,
  loser: ProjectEstimate,
): UpdateResult {
  const { alpha, beta } = updatedJudge(judge, winner, loser);
  const mus = updatedMus(judge, winner, loser);
  const sigmaSqs = updatedSigmaSqs(judge, winner, loser);
  return {
    judge: { alpha, beta },
    winner: { mu: mus.winner, sigmaSq: sigmaSqs.winner },
    loser: { mu: mus.loser, sigmaSq: sigmaSqs.loser },
  };
}

/**
 * Expected information gain from asking `judge` to compare `a` with `b`:
 * the probability-weighted divergence of the posterior from the prior over
 * both outcomes. Dispatch sends a judge where this is highest.
 */
export function expectedInformationGain(
  judge: JudgeReliability,
  a: ProjectEstimate,
  b: ProjectEstimate,
): number {
  const { alpha, beta } = judge;

  const judge1 = updatedJudge(judge, a, b);
  const mus1 = updatedMus(judge, a, b);
  const sigmaSqs1 = updatedSigmaSqs(judge, a, b);
  const probARankedAbove = judge1.c;

  const judge2 = updatedJudge(judge, b, a);
  const mus2 = updatedMus(judge, b, a);
  const sigmaSqs2 = updatedSigmaSqs(judge, b, a);

  return (
    probARankedAbove *
      (divergenceGaussian(mus1.winner, sigmaSqs1.winner, a.mu, a.sigmaSq) +
        divergenceGaussian(mus1.loser, sigmaSqs1.loser, b.mu, b.sigmaSq) +
        GAMMA * divergenceBeta(judge1.alpha, judge1.beta, alpha, beta)) +
    (1 - probARankedAbove) *
      (divergenceGaussian(mus2.loser, sigmaSqs2.loser, a.mu, a.sigmaSq) +
        divergenceGaussian(mus2.winner, sigmaSqs2.winner, b.mu, b.sigmaSq) +
        GAMMA * divergenceBeta(judge2.alpha, judge2.beta, alpha, beta))
  );
}

function updatedMus(
  { alpha, beta }: JudgeReliability,
  winner: ProjectEstimate,
  loser: ProjectEstimate,
): { winner: number; loser: number } {
  const expW = Math.exp(winner.mu);
  const expL = Math.exp(loser.mu);
  const mult =
    (alpha * expW) / (alpha * expW + beta * expL) - expW / (expW + expL);
  return {
    winner: winner.mu + winner.sigmaSq * mult,
    loser: loser.mu - loser.sigmaSq * mult,
  };
}

function updatedSigmaSqs(
  { alpha, beta }: JudgeReliability,
  winner: ProjectEstimate,
  loser: ProjectEstimate,
): { winner: number; loser: number } {
  const expW = Math.exp(winner.mu);
  const expL = Math.exp(loser.mu);
  const mult =
    (alpha * expW * beta * expL) / (alpha * expW + beta * expL) ** 2 -
    (expW * expL) / (expW + expL) ** 2;
  return {
    winner: winner.sigmaSq * Math.max(1 + winner.sigmaSq * mult, KAPPA),
    loser: loser.sigmaSq * Math.max(1 + loser.sigmaSq * mult, KAPPA),
  };
}

/** Updated (α, β), plus c: the probability the judge ranks winner above loser. */
function updatedJudge(
  { alpha, beta }: JudgeReliability,
  winner: ProjectEstimate,
  loser: ProjectEstimate,
): JudgeReliability & { c: number } {
  const expW = Math.exp(winner.mu);
  const expL = Math.exp(loser.mu);
  const c1 =
    expW / (expW + expL) +
    (0.5 * (winner.sigmaSq + loser.sigmaSq) * (expW * expL * (expL - expW))) /
      (expW + expL) ** 3;
  const c2 = 1 - c1;
  const c = (c1 * alpha + c2 * beta) / (alpha + beta);

  const expt =
    (c1 * (alpha + 1) * alpha + c2 * alpha * beta) /
    (c * (alpha + beta + 1) * (alpha + beta));
  const exptSq =
    (c1 * (alpha + 2) * (alpha + 1) * alpha + c2 * (alpha + 1) * alpha * beta) /
    (c * (alpha + beta + 2) * (alpha + beta + 1) * (alpha + beta));

  const variance = exptSq - expt ** 2;
  return {
    alpha: ((expt - exptSq) * expt) / variance,
    beta: ((expt - exptSq) * (1 - expt)) / variance,
    c,
  };
}
