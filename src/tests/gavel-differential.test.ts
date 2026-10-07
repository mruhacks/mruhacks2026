/**
 * Differential tests: our Gavel port against Gavel itself.
 *
 * vendor/gavel is an unmodified copy of upstream Gavel; vendor/gavel-oracle
 * runs it (Flask app, SQLAlchemy models, numpy/scipy `crowd_bt`) as a child
 * process. Two layers are compared:
 *
 * - `crowd_bt`: `update`, `expected_information_gain`, `betaln` and `psi` on
 *   thousands of random inputs, including the corners (tiny σ², lopsided
 *   reliabilities) that the hand-picked cases in unit/crowd-bt.test.ts skip.
 * - The whole judge flow, end to end: simulated judges walk both systems in
 *   lockstep — ours through the real server actions and database, Gavel's
 *   through its real HTTP routes — and after every step both must show the
 *   same screen, having drawn the same number of random values. At the end
 *   scores, reliabilities, the vote log and a results replay must all agree.
 *
 * Both sides read one shared stream of random numbers (Gavel's numpy calls
 * are swapped for it in the oracle; ours via `Math.random`) and one shared
 * clock, so any difference in filtering, busy windows, view counts, shuffling,
 * the epsilon roll or the information-gain argmax shows up as a divergence.
 *
 * The scenario is Gavel's own feature set: one criterion (Gavel has no
 * criteria), no deactivation mid-visit, and skips as "conflict" — Gavel's Skip
 * is permanent, whereas our "not here" deliberately comes back after a while.
 *
 * Slow, so not part of `pnpm test`: run it with `pnpm test:gavel` (CI does).
 *
 * The oracle runs in Docker (vendor/gavel-oracle/Dockerfile), built on first
 * use and cached after; without Docker these tests skip, except in CI.
 * GAVEL_FUZZ_SEED=<n> replays one scenario, GAVEL_FUZZ_RUNS=<n> runs more.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  eventJudges,
  events,
  judgeReliability,
  judgingCriteria,
  judgingVotes,
  submissionScores,
  submissions,
  teams,
  user,
} from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
  updateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import {
  beginJudging,
  skipJudgeProject,
  submitJudgeVote,
} from '@/app/dashboard/events/judge-actions';
import {
  betaln,
  expectedInformationGain,
  psi,
  update,
} from '@/lib/judging/crowd-bt';
import { getJudgeView } from '@/lib/judging/judge-session';
import { replayVotes } from '@/lib/judging/results';
import { unwrap } from './unwrap';

const VENDOR_DIR = path.resolve(process.cwd(), 'vendor');
const ORACLE_IMAGE = 'mruhacks-gavel-oracle';
const HAS_DOCKER = spawnSync('docker', ['info']).status === 0;
// CI must never silently skip this; locally, say why it didn't run.
const RUN = HAS_DOCKER || !!process.env.CI;
if (!RUN) {
  console.warn('Skipping Gavel differential tests: Docker is not running.');
}

/** Builds the oracle image; a no-op from Docker's cache unless vendor/ changed. */
function buildOracleImage() {
  const build = spawnSync(
    'docker',
    [
      'build',
      '--quiet',
      '--tag',
      ORACLE_IMAGE,
      '--file',
      path.join(VENDOR_DIR, 'gavel-oracle/Dockerfile'),
      VENDOR_DIR,
    ],
    { encoding: 'utf8' },
  );
  if (build.status !== 0) {
    throw new Error(`docker build failed: ${build.stderr}`);
  }
}

const FIXED_SEED = process.env.GAVEL_FUZZ_SEED;
const RUNS = Number(process.env.GAVEL_FUZZ_RUNS ?? 25);
const SEEDS = FIXED_SEED
  ? [Number(FIXED_SEED)]
  : Array.from({ length: RUNS }, (_, i) => 1000 + i);

// ── Oracle process ─────────────────────────────────────────────────────────

type OracleReply = { ok: true; result: unknown; consumed: number };

class Oracle {
  private child: ChildProcess;
  private pending: ((line: string) => void)[] = [];
  private stderr = '';

  constructor() {
    this.child = spawn('docker', ['run', '--rm', '-i', ORACLE_IMAGE], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stderr!.on('data', (chunk) => (this.stderr += chunk));
    createInterface({ input: this.child.stdout! }).on('line', (line) =>
      this.pending.shift()?.(line),
    );
  }

  async call<T>(
    message: Record<string, unknown>,
  ): Promise<OracleReply & { result: T }> {
    const line = await new Promise<string>((resolve, reject) => {
      this.pending.push(resolve);
      this.child.once('exit', (code) =>
        reject(new Error(`oracle exited (${code}): ${this.stderr}`)),
      );
      this.child.stdin!.write(JSON.stringify(message) + '\n');
    });
    const reply = JSON.parse(line) as
      | OracleReply
      | { ok: false; error: string };
    if (!reply.ok) throw new Error(`oracle: ${reply.error}`);
    return reply as OracleReply & { result: T };
  }

  close() {
    this.child.stdin!.end();
  }
}

let oracle: Oracle;

// ── Helpers ────────────────────────────────────────────────────────────────

/** mulberry32: small, seedable, good enough to generate scenarios. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function logUniform(rand: () => number, lo: number, hi: number): number {
  return Math.exp(Math.log(lo) + rand() * (Math.log(hi) - Math.log(lo)));
}

function int(rand: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** Gaussian via Box–Muller. */
function normal(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/**
 * Equal up to floating-point noise: the port's Lanczos/asymptotic special
 * functions and V8's `Math.exp` agree with scipy/numpy to ~1e-13, and that
 * error compounds a little over a long vote sequence.
 */
function close(actual: number, expected: number, rel = 1e-9): boolean {
  if (Number.isNaN(expected)) return Number.isNaN(actual);
  return (
    Math.abs(actual - expected) <=
    rel * Math.max(1, Math.abs(actual), Math.abs(expected))
  );
}

function expectClose(actual: number[], expected: number[], context: unknown) {
  const ok =
    actual.length === expected.length &&
    actual.every((value, i) => close(value, expected[i]));
  if (!ok) {
    throw new Error(
      `mismatch for ${JSON.stringify(context)}\n  ours:  ${JSON.stringify(actual)}\n  gavel: ${JSON.stringify(expected)}`,
    );
  }
}

// ── crowd_bt ───────────────────────────────────────────────────────────────

/** α, β, μ_winner, σ²_winner, μ_loser, σ²_loser — Gavel's argument order. */
type CrowdBtArgs = [number, number, number, number, number, number];

function randomCrowdBtArgs(rand: () => number): CrowdBtArgs {
  const reliability = (): number =>
    rand() < 0.3 ? 1 + rand() * 20 : logUniform(rand, 0.05, 500);
  const mu = (): number => (rand() < 0.2 ? 0 : normal(rand) * 3);
  const sigmaSq = (): number => (rand() < 0.2 ? 1 : logUniform(rand, 1e-4, 3));
  return [reliability(), reliability(), mu(), sigmaSq(), mu(), sigmaSq()];
}

async function compareCrowdBt(seed: number, n: number) {
  const rand = prng(seed);
  const cases = Array.from({ length: n }, () => randomCrowdBtArgs(rand));

  const updates = await oracle.call<number[][]>({
    op: 'crowd_bt',
    fn: 'update',
    calls: cases,
  });
  const gains = await oracle.call<number[]>({
    op: 'crowd_bt',
    fn: 'expected_information_gain',
    calls: cases,
  });

  cases.forEach((args, i) => {
    const [alpha, beta, muW, sigmaSqW, muL, sigmaSqL] = args;
    const winner = { mu: muW, sigmaSq: sigmaSqW };
    const loser = { mu: muL, sigmaSq: sigmaSqL };
    const ours = update({ alpha, beta }, winner, loser);
    expectClose(
      [
        ours.judge.alpha,
        ours.judge.beta,
        ours.winner.mu,
        ours.winner.sigmaSq,
        ours.loser.mu,
        ours.loser.sigmaSq,
      ],
      updates.result[i],
      { fn: 'update', args },
    );
    expectClose(
      [expectedInformationGain({ alpha, beta }, winner, loser)],
      [gains.result[i]],
      { fn: 'expected_information_gain', args },
    );
  });
}

// ── Judge flow ─────────────────────────────────────────────────────────────

type Screen =
  | { kind: 'waiting' }
  | { kind: 'begin'; current: number }
  | { kind: 'compare'; previous: number; current: number };

type Action = 'begin' | 'skip' | 'previous' | 'current';

type GavelState = {
  projects: { mu: number; sigmaSq: number; views: number }[];
  judges: { alpha: number; beta: number }[];
  votes: { judge: number; winner: number; loser: number }[];
};

type TestUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
};

const created: { users: string[]; events: string[] } = {
  users: [],
  events: [],
};
let counter = 0;

async function makeUser(): Promise<TestUser> {
  counter += 1;
  const [u] = await db
    .insert(user)
    .values({
      name: `Gavel judge ${counter}`,
      email: `gavel-diff-${counter}-${Date.now()}@example.com`,
      emailVerified: true,
    })
    .returning({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
    });
  created.users.push(u.id);
  return u;
}

/** An open event with one criterion, `n` projects (in Gavel's id order) and `m` judges. */
async function makeScenarioEvent(n: number, m: number) {
  const now = Date.now();
  const [event] = await db
    .insert(events)
    .values({
      name: 'Gavel Differential Event',
      hasApplication: true,
      teamsEnabled: true,
      startsAt: new Date(now - 60 * 60 * 1000),
      endsAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: events.id });
  created.events.push(event.id);

  const [criterion] = await db
    .insert(judgingCriteria)
    .values({ eventId: event.id, name: 'Overall', position: 0 })
    .returning({ id: judgingCriteria.id });

  const projectIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const [team] = await db
      .insert(teams)
      .values({
        eventId: event.id,
        code: `G${String(counter++).padStart(7, '0')}`,
      })
      .returning({ id: teams.id });
    const [s] = await db
      .insert(submissions)
      .values({
        eventId: event.id,
        teamId: team.id,
        title: `P${i}`,
        published: true,
        publishedAt: new Date(now),
        // Gavel lists items by id; the port lists the pool by creation.
        createdAt: new Date(now - 10 * 60 * 60 * 1000 + i * 1000),
      })
      .returning({ id: submissions.id });
    projectIds.push(s.id);
  }

  const judges: { user: TestUser; judgeId: string }[] = [];
  for (let j = 0; j < m; j++) {
    const u = await makeUser();
    const [row] = await db
      .insert(eventJudges)
      .values({ eventId: event.id, email: u.email.toLowerCase(), userId: u.id })
      .returning({ id: eventJudges.id });
    judges.push({ user: u, judgeId: row.id });
  }

  return { eventId: event.id, criterionId: criterion.id, projectIds, judges };
}

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/**
 * One simulated expo. Every random choice — scenario shape, which judge acts,
 * what they press, how far the clock moves — comes from `seed`.
 */
async function runScenario(seed: number) {
  const rand = prng(seed);
  const n = int(rand, 2, 12);
  const m = int(rand, 1, 4);
  const steps = int(rand, 10, 25) * m;
  const skipRate = rand() * 0.25;
  /** Hidden "true" quality: what a perfect judge would rank by. */
  const quality = Array.from({ length: n }, () => normal(rand));
  /** Per judge: how much noise they add when comparing. */
  const noise = Array.from({ length: m }, () => rand() * 1.5);

  // Shared by both sides: dispatch's shuffles and epsilon rolls.
  const streamRand = prng(seed ^ 0x5eed);
  const stream = Array.from({ length: 50_000 }, () => streamRand());

  const { eventId, criterionId, projectIds, judges } = await makeScenarioEvent(
    n,
    m,
  );
  const indexOf = new Map(projectIds.map((id, i) => [id, i]));
  await oracle.call({ op: 'reset', projects: n, judges: m, stream });

  // Only dispatch's draws come from the stream: postgres.js also calls
  // Math.random (statement ids, connection lifetimes) whenever the pool opens
  // a connection, which has nothing to do with Gavel.
  const realRandom = Math.random.bind(Math);
  let consumed = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    if (!new Error().stack?.includes('lib/judging/dispatch')) {
      return realRandom();
    }
    if (consumed >= stream.length) throw new Error('random stream exhausted');
    return stream[consumed++];
  });

  const log: string[] = [];
  const context = () =>
    `seed ${seed} (n=${n}, m=${m}); replay with GAVEL_FUZZ_SEED=${seed}\n` +
    log.slice(-12).join('\n');

  async function ourScreen(j: number): Promise<Screen> {
    vi.mocked(getUser).mockResolvedValue(judges[j].user as never);
    const view = await getJudgeView(eventId);
    switch (view.kind) {
      case 'waiting':
        return { kind: 'waiting' };
      case 'begin':
        return { kind: 'begin', current: indexOf.get(view.current.id)! };
      case 'compare':
        return {
          kind: 'compare',
          previous: indexOf.get(view.previous.id)!,
          current: indexOf.get(view.current.id)!,
        };
      default:
        throw new Error(`unexpected judge view ${view.kind}`);
    }
  }

  async function ourAction(j: number, screen: Screen, action: Action) {
    vi.mocked(getUser).mockResolvedValue(judges[j].user as never);
    if (screen.kind === 'waiting') throw new Error('nothing to act on');
    const currentId = projectIds[screen.current];
    if (action === 'skip') {
      unwrap(
        await skipJudgeProject(
          eventId,
          formData({ currentId, reason: 'conflict' }),
        ),
      );
    } else if (action === 'begin') {
      unwrap(await beginJudging(eventId, formData({ currentId })));
    } else if (screen.kind === 'compare') {
      unwrap(
        await submitJudgeVote(
          eventId,
          formData({
            previousId: projectIds[screen.previous],
            currentId,
            [`winner:${criterionId}`]: action,
          }),
        ),
      );
    }
  }

  async function bothScreens(j: number, label: string): Promise<Screen> {
    const ours = await ourScreen(j);
    const gavel = await oracle.call<Screen>({ op: 'view', judge: j });
    log.push(
      `${label} judge ${j}: ours ${JSON.stringify(ours)} @${consumed}, gavel ${JSON.stringify(gavel.result)} @${gavel.consumed}`,
    );
    expect(ours, context()).toEqual(gavel.result);
    expect(consumed, `random draws diverged — ${context()}`).toBe(
      gavel.consumed,
    );
    return ours;
  }

  try {
    for (let step = 0; step < steps; step++) {
      const j = int(rand, 0, m - 1);
      if (rand() < 0.3) {
        // Up to 4 minutes, so the 5-minute busy window sometimes lapses.
        const ms = Math.floor(rand() * 4 * 60 * 1000);
        vi.setSystemTime(Date.now() + ms);
        await oracle.call({ op: 'advance', ms });
        log.push(`clock +${ms}ms`);
      }

      const screen = await bothScreens(j, `step ${step} view`);
      if (screen.kind === 'waiting') continue;

      let action: Action;
      if (rand() < skipRate) {
        action = 'skip';
      } else if (screen.kind === 'begin') {
        action = 'begin';
      } else {
        const diff =
          quality[screen.current] -
          quality[screen.previous] +
          noise[j] * normal(rand);
        action = diff > 0 ? 'current' : 'previous';
      }
      log.push(`step ${step} judge ${j}: ${action}`);

      await ourAction(j, screen, action);
      await oracle.call({ op: 'act', judge: j, action });
      await bothScreens(j, `step ${step} after`);
    }
  } finally {
    vi.mocked(Math.random).mockRestore();
  }

  // ── Final state ──
  const gavel = (await oracle.call<GavelState>({ op: 'state' })).result;

  const votes = await db
    .select({
      judgeId: judgingVotes.judgeId,
      criterionId: judgingVotes.criterionId,
      winnerId: judgingVotes.winnerSubmissionId,
      loserId: judgingVotes.loserSubmissionId,
    })
    .from(judgingVotes)
    .where(eq(judgingVotes.criterionId, criterionId))
    .orderBy(asc(judgingVotes.createdAt), asc(judgingVotes.id));
  const judgeIndex = new Map(judges.map((judge, i) => [judge.judgeId, i]));
  expect(
    votes.map((v) => ({
      judge: judgeIndex.get(v.judgeId),
      winner: indexOf.get(v.winnerId),
      loser: indexOf.get(v.loserId),
    })),
    context(),
  ).toEqual(gavel.votes);

  const scores = new Map(
    (
      await db
        .select()
        .from(submissionScores)
        .where(inArray(submissionScores.submissionId, projectIds))
    ).map((row) => [row.submissionId, row]),
  );
  const replay = replayVotes(votes, new Set(projectIds), [criterionId]);
  projectIds.forEach((id, i) => {
    const expected = [gavel.projects[i].mu, gavel.projects[i].sigmaSq];
    const online = scores.get(id) ?? { mu: 0, sigmaSq: 1 };
    expectClose([online.mu, online.sigmaSq], expected, {
      seed,
      project: i,
      source: 'submission_scores',
    });
    const replayed = replay.byCriterion.get(criterionId)!.get(id)!;
    expectClose([replayed.mu, replayed.sigmaSq], expected, {
      seed,
      project: i,
      source: 'results replay',
    });
  });

  const reliability = new Map(
    (
      await db
        .select()
        .from(judgeReliability)
        .where(
          inArray(
            judgeReliability.judgeId,
            judges.map((judge) => judge.judgeId),
          ),
        )
    ).map((row) => [row.judgeId, row]),
  );
  judges.forEach(({ judgeId }, i) => {
    const online = reliability.get(judgeId) ?? { alpha: 10, beta: 1 };
    expectClose(
      [online.alpha, online.beta],
      [gavel.judges[i].alpha, gavel.judges[i].beta],
      { seed, judge: i, source: 'judge_reliability' },
    );
  });

  return votes.length;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe.runIf(RUN)('Gavel differential', () => {
  beforeAll(async () => {
    // The first build installs Gavel's dependencies; later ones are cached.
    buildOracleImage();
    oracle = new Oracle();
    await oracle.call({ op: 'ping' });
  }, 300_000);

  afterAll(async () => {
    oracle?.close();
    if (created.events.length > 0) {
      await db.delete(events).where(inArray(events.id, created.events));
    }
    if (created.users.length > 0) {
      await db.delete(user).where(inArray(user.id, created.users));
    }
  });

  test('crowd_bt update and expected information gain match on random inputs', async () => {
    await compareCrowdBt(FIXED_SEED ? Number(FIXED_SEED) : 42, 5000);
  });

  test('betaln and psi match scipy across their range', async () => {
    const rand = prng(7);
    const pairs = Array.from({ length: 2000 }, () => [
      logUniform(rand, 1e-3, 1e4),
      logUniform(rand, 1e-3, 1e4),
    ]);
    const xs = Array.from({ length: 2000 }, () => [
      logUniform(rand, 1e-3, 1e5),
    ]);
    const gavelBetaln = await oracle.call<number[]>({
      op: 'crowd_bt',
      fn: 'betaln',
      calls: pairs,
    });
    const gavelPsi = await oracle.call<number[]>({
      op: 'crowd_bt',
      fn: 'psi',
      calls: xs,
    });
    pairs.forEach(([a, b], i) =>
      expectClose([betaln(a, b)], [gavelBetaln.result[i]], {
        fn: 'betaln',
        a,
        b,
      }),
    );
    xs.forEach(([x], i) =>
      expectClose([psi(x)], [gavelPsi.result[i]], { fn: 'psi', x }),
    );
  });

  describe('judge flow, step for step', () => {
    let comparisons = 0;

    beforeAll(() => {
      // Only Date: timers stay real so the database driver behaves.
      vi.useFakeTimers({ toFake: ['Date'] });
    });
    afterAll(() => {
      vi.useRealTimers();
      // One scenario may skip its way through without a vote; all of them
      // together must not, or the comparison proved little.
      if (!FIXED_SEED) expect(comparisons).toBeGreaterThan(SEEDS.length);
    });

    test.each(SEEDS)(
      'seed %i',
      async (seed) => {
        comparisons += await runScenario(seed);
      },
      120_000,
    );
  });
});
