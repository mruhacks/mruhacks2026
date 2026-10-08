import { describe, expect, it } from 'vitest';

import {
  ALPHA_PRIOR,
  BETA_PRIOR,
  betaln,
  expectedInformationGain,
  psi,
  update,
} from '@/lib/judging/crowd-bt';

// Reference values computed with Gavel's own gavel/crowd_bt.py (numpy/scipy).
const UPDATE_CASES = [
  [
    [10, 1, 0, 1, 0, 1],
    [
      9.999999999999808, 0.9999999999999812, 0.40909090909090906,
      0.8326446280991735, -0.40909090909090906, 0.8326446280991735,
    ],
  ],
  [
    [10, 1, 0.5, 0.8, -0.3, 0.6],
    [
      10.339618394908271, 0.996421201075741, 0.7136198165017545,
      0.6894348719201622, -0.4602148623763159, 0.5378071154550912,
    ],
  ],
  [
    [3, 2, 1.2, 0.05, 1.1, 0.4],
    [
      3.026144157590243, 1.9880382248284656, 1.2049381801131176,
      0.04996327920448537, 1.0604945590950585, 0.397649869087064,
    ],
  ],
  [
    [1.5, 4, -2, 2.5, 3, 0.01],
    [
      1.49725441684287, 4.966503919316317, -2.010431222684601,
      2.474162205973732, 3.0000417248907385, 0.00999958659529558,
    ],
  ],
  [
    [12.3, 0.7, 0.0001, 1, 0, 0.9999],
    [
      12.30003895141589, 0.6999997166705784, 0.4462339406011283,
      0.8009422003466975, -0.44608932720706823, 0.8008820099160502,
    ],
  ],
  [
    [10, 1, 4, 0.3, -4, 0.3],
    [
      10.999389641360139, 0.9999920767656729, 4.000090541497897,
      0.2999728475707299, -4.000090541497897, 0.2999728475707299,
    ],
  ],
] as const;
const EIG_CASES = [
  [[10, 1, 0, 1, 0, 1], 0.18314834476994848],
  [[10, 1, 0.5, 0.8, -0.3, 0.6], 0.10651941363986314],
  [[3, 2, 1.2, 0.05, 1.1, 0.4], 0.002260110376921103],
  [[1.5, 4, -2, 2.5, 3, 0.01], 0.007535134359073924],
  [[12.3, 0.7, 0.0001, 1, 0, 0.9999], 0.22194839273630934],
  [[10, 1, 4, 0.3, -4, 0.3], 0.003818022724981648],
] as const;
const BETALN_CASES = [
  [[10, 1], -2.302585092994046],
  [[0.5, 0.5], 1.1447298858494],
  [[2.3, 7.9], -4.775811421267109],
  [[100, 3], -13.152116335553677],
  [[0.001, 2], 6.906755778649054],
] as const;
const PSI_CASES = [
  [0.01, -100.56088545786868],
  [0.5, -1.9635100260214235],
  [1, -0.5772156649015329],
  [2.5, 0.7031566406452432],
  [11, 2.3517525890667215],
  [123.4, 4.8113737751162775],
] as const;
const SEQUENCE = {
  votes: [
    [0, 1],
    [1, 2],
    [0, 2],
    [2, 0],
    [1, 0],
  ],
  final: {
    alpha: 9.32577754174161,
    beta: 1.0355957136381937,
    mu: [-0.07535357726342645, 0.3109738973269395, -0.3029346105948582],
    s: [0.6576877412812223, 0.6693959847087034, 0.7611877921301569],
  },
} as const;

function expectClose(actual: number, expected: number) {
  // Relative, so large and tiny values are held to the same standard.
  const tolerance = 1e-9 * Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe('special functions match scipy', () => {
  it.each(BETALN_CASES)('betaln(%j)', ([a, b], expected) => {
    expectClose(betaln(a, b), expected);
  });

  it.each(PSI_CASES)('psi(%j)', (x, expected) => {
    expectClose(psi(x), expected);
  });
});

describe('update matches gavel crowd_bt.update', () => {
  it.each(UPDATE_CASES)('update(%j)', (input, expected) => {
    const [alpha, beta, muW, sigmaSqW, muL, sigmaSqL] = input;
    const result = update(
      { alpha, beta },
      { mu: muW, sigmaSq: sigmaSqW },
      { mu: muL, sigmaSq: sigmaSqL },
    );
    const actual = [
      result.judge.alpha,
      result.judge.beta,
      result.winner.mu,
      result.winner.sigmaSq,
      result.loser.mu,
      result.loser.sigmaSq,
    ];
    actual.forEach((value, i) => expectClose(value, expected[i]));
  });

  it('a winner moves up and a loser down', () => {
    const { winner, loser } = update(
      { alpha: ALPHA_PRIOR, beta: BETA_PRIOR },
      { mu: 0, sigmaSq: 1 },
      { mu: 0, sigmaSq: 1 },
    );
    expect(winner.mu).toBeGreaterThan(0);
    expect(loser.mu).toBeLessThan(0);
    expect(winner.sigmaSq).toBeLessThan(1);
  });

  it('replays a vote sequence to the same state as gavel', () => {
    let judge = { alpha: ALPHA_PRIOR, beta: BETA_PRIOR };
    const projects = [0, 1, 2].map(() => ({ mu: 0, sigmaSq: 1 }));
    for (const [w, l] of SEQUENCE.votes) {
      const next = update(judge, projects[w], projects[l]);
      judge = next.judge;
      projects[w] = next.winner;
      projects[l] = next.loser;
    }
    expectClose(judge.alpha, SEQUENCE.final.alpha);
    expectClose(judge.beta, SEQUENCE.final.beta);
    projects.forEach((p, i) => {
      expectClose(p.mu, SEQUENCE.final.mu[i]);
      expectClose(p.sigmaSq, SEQUENCE.final.s[i]);
    });
  });
});

describe('expectedInformationGain matches gavel', () => {
  it.each(EIG_CASES)('expected_information_gain(%j)', (input, expected) => {
    const [alpha, beta, muA, sigmaSqA, muB, sigmaSqB] = input;
    expectClose(
      expectedInformationGain(
        { alpha, beta },
        { mu: muA, sigmaSq: sigmaSqA },
        { mu: muB, sigmaSq: sigmaSqB },
      ),
      expected,
    );
  });

  it('prefers uncertain, close matchups over settled ones', () => {
    const judge = { alpha: ALPHA_PRIOR, beta: BETA_PRIOR };
    const prev = { mu: 0, sigmaSq: 1 };
    const close = expectedInformationGain(judge, prev, { mu: 0, sigmaSq: 1 });
    const settled = expectedInformationGain(judge, prev, {
      mu: 5,
      sigmaSq: 0.01,
    });
    expect(close).toBeGreaterThan(settled);
  });
});
