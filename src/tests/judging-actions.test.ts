/**
 * Tests for expo judging: the organizer actions in
 * src/app/dashboard/admin/events/judging-actions.ts and the judge flow in
 * src/app/dashboard/events/judge-actions.ts, against a real database.
 *
 * The invite mailer is mocked: these are about roster and judging logic.
 */
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { and, eq, inArray, or } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
  updateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));
const sendJudgeInvite = vi.fn<(args: { email: string; eventName: string }) => Promise<void>>();
const createJudgeSignInLink = vi.fn<(email: string) => Promise<string>>();
vi.mock('@/lib/judging/judge-invite', () => ({
  sendJudgeInvite: (args: { email: string; eventName: string }) => sendJudgeInvite(args),
  createJudgeSignInLink: (email: string) => createJudgeSignInLink(email),
}));

import { getUser } from '@/utils/auth';
import { GET as getSignInQr } from '@/app/api/admin/events/[eventId]/judges/[judgeId]/signin-qr/route';
import {
  addEventJudge,
  getJudgingAdmin,
  getJudgingProjects,
  getJudgingResults,
  removeEventJudge,
  resendJudgeInvite,
  saveJudgingCriteria,
  sendOutstandingJudgeInvites,
  setEventJudgeDisabled,
  setSubmissionDeactivated,
  setSubmissionPlacement,
  updateJudgingTableLayout,
} from '@/app/dashboard/admin/events/judging-actions';
import { beginJudging, skipJudgeProject, submitJudgeVote } from '@/app/dashboard/events/judge-actions';
import { registerForEvent } from '@/app/register/actions';
import { prepareUserDeletion } from '@/lib/account-deletion';
import * as Participation from '@/lib/participation/server';
import * as Judging from '@/lib/judging/server';
import { unwrap } from '@/tests/unwrap';

type TestUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
};

function loginAs(u: TestUser) {
  vi.mocked(getUser).mockResolvedValue(u as never);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const created: { users: string[]; events: string[] } = {
  users: [],
  events: [],
};
let counter = 0;

async function makeUser(label: string): Promise<TestUser> {
  counter += 1;
  const [u] = await db
    .insert(schema.user)
    .values({
      name: `Judging ${label}`,
      email: `judging-test-${label.toLowerCase()}-${counter}-${Date.now()}@example.com`,
      emailVerified: true,
    })
    .returning({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
      image: schema.user.image,
      emailVerified: schema.user.emailVerified,
    });
  created.users.push(u.id);
  return u;
}

async function grant(userId: string, slugs: string[]) {
  for (const slug of slugs) {
    await db.insert(schema.permission).values({ slug, description: 'test permission' }).onConflictDoNothing();
    const [p] = await db
      .select({ id: schema.permission.id })
      .from(schema.permission)
      .where(eq(schema.permission.slug, slug));
    await db.insert(schema.userPermission).values({ userId, permissionId: p!.id }).onConflictDoNothing();
  }
}

/** An event in progress: judging open, submissions still open. */
async function makeEvent(overrides: Partial<typeof schema.events.$inferInsert> = {}): Promise<string> {
  const now = Date.now();
  const [e] = await db
    .insert(schema.events)
    .values({
      name: 'Judging Test Event',
      hasApplication: true,
      teamsEnabled: true,
      startsAt: new Date(now - HOUR),
      submissionsCloseAt: new Date(now + HOUR),
      endsAt: new Date(now + 2 * HOUR),
      ...overrides,
    })
    .returning({ id: schema.events.id });
  created.events.push(e.id);
  return e.id;
}

/**
 * `n` projects, created a second apart. Published ones take their table as
 * the publish action would, so a fresh event's tables are 1..n.
 */
async function makeProjects(eventId: string, n: number, { published = true } = {}): Promise<string[]> {
  const ids: string[] = [];
  const base = Date.now() - 10 * HOUR;
  for (let i = 0; i < n; i++) {
    const [team] = await db
      .insert(schema.teams)
      .values({ eventId, code: `J${String(counter++).padStart(7, '0')}` })
      .returning({ id: schema.teams.id });
    const [s] = await db
      .insert(schema.submissions)
      .values({
        eventId,
        teamId: team.id,
        title: `Project ${i + 1}`,
        published,
        publishedAt: published ? new Date() : null,
        createdAt: new Date(base + (ids.length + 1) * 1000),
      })
      .returning({ id: schema.submissions.id });
    if (published) await Judging.assignTableSlot(db, eventId, s.id);
    ids.push(s.id);
  }
  return ids;
}

async function loadEventCriteria(eventId: string) {
  return db
    .select()
    .from(schema.judgingCriteria)
    .where(eq(schema.judgingCriteria.eventId, eventId))
    .orderBy(schema.judgingCriteria.position);
}

/** Equally weighted criteria, saved the way the criteria table saves them. */
async function addCriteria(eventId: string, names: string[]) {
  unwrap(
    await saveJudgingCriteria(
      eventId,
      names.map((name) => ({
        name,
        description: `${name}, briefly`,
        weight: 1 / names.length,
      })),
    ),
  );
  return loadEventCriteria(eventId);
}

/** The criteria table's rows for what's stored, with some fields changed. */
function asRows(
  criteria: (typeof schema.judgingCriteria.$inferSelect)[],
  patch: Record<string, Partial<{ name: string; weight: number }>> = {},
) {
  return criteria.map(({ id, name, description, weight }) => ({
    id,
    name,
    description,
    weight,
    ...patch[id],
  }));
}

async function rosterJudge(eventId: string, judge: TestUser, { link = true } = {}): Promise<string> {
  const [row] = await db
    .insert(schema.eventJudges)
    .values({
      eventId,
      email: judge.email.toLowerCase(),
      userId: link ? judge.id : null,
    })
    .returning({ id: schema.eventJudges.id });
  return row.id;
}

function expectKind<K extends Judging.JudgeView['kind']>(
  view: Judging.JudgeView,
  kind: K,
): Extract<Judging.JudgeView, { kind: K }> {
  expect(view.kind).toBe(kind);
  return view as Extract<Judging.JudgeView, { kind: K }>;
}

/** The judge actions take what their forms post. */
function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function voteForm(previousId: string, currentId: string, winners: Record<string, 'previous' | 'current'>): FormData {
  return formData({
    previousId,
    currentId,
    ...Object.fromEntries(Object.entries(winners).map(([id, side]) => [`winner:${id}`, side])),
  });
}

/** Each action refreshes the judge page; these return what it then shows. */
async function begin(eventId: string, currentId: string) {
  unwrap(await beginJudging(eventId, formData({ currentId })));
  return Judging.getJudgeView(eventId);
}

async function skip(eventId: string, currentId: string, reason: 'not_here' | 'conflict') {
  unwrap(await skipJudgeProject(eventId, formData({ currentId, reason })));
  return Judging.getJudgeView(eventId);
}

async function voteAll(
  eventId: string,
  view: Extract<Judging.JudgeView, { kind: 'compare' }>,
  side: 'previous' | 'current',
) {
  unwrap(
    await submitJudgeVote(
      eventId,
      voteForm(view.previous.id, view.current.id, Object.fromEntries(view.criteria.map((c) => [c.id, side]))),
    ),
  );
  return Judging.getJudgeView(eventId);
}

let organizer: TestUser;

async function makeOrganizer(): Promise<TestUser> {
  const u = await makeUser('Organizer');
  await grant(u.id, ['judging:manage:all', 'judging:results:all', 'judging:award:all']);
  return u;
}

beforeEach(async () => {
  sendJudgeInvite.mockReset();
  sendJudgeInvite.mockResolvedValue();
  createJudgeSignInLink.mockReset();
  createJudgeSignInLink.mockResolvedValue('http://localhost:3000/signin/verify?token=abc&link=magic-link');
  if (!organizer) organizer = await makeOrganizer();
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Holds a transaction open: runs `hold` (taking whatever locks it takes),
 * then waits for `release()` before committing.
 */
function holdTransaction(hold: (tx: Tx) => Promise<void>) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: () => void;
  const acquired = new Promise<void>((resolve) => (held = resolve));
  const done = db.transaction(async (tx) => {
    await hold(tx);
    held();
    await released;
  });
  return { acquired, release, done };
}

/** Long enough for a concurrent call to reach the lock it waits on. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

afterAll(async () => {
  if (created.events.length > 0) {
    await db.delete(schema.events).where(inArray(schema.events.id, created.events));
  }
  if (created.users.length > 0) {
    await db.delete(schema.user).where(inArray(schema.user.id, created.users));
  }
});

describe('criteria', () => {
  test('organizers add, edit, reorder and remove criteria in one save', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const [design, tech, pitch] = await addCriteria(eventId, ['Design', 'Tech', 'Pitch']);
    expect([design.position, tech.position, pitch.position]).toEqual([0, 1, 2]);

    // Pitch moves up, Design goes, Tech is renamed, and Demo is new.
    unwrap(
      await saveJudgingCriteria(eventId, [
        { id: pitch.id, name: 'Pitch', description: '', weight: 0.25 },
        {
          id: tech.id,
          name: 'Technical depth',
          description: 'How hard was it?',
          weight: 0.5,
        },
        { name: 'Demo', description: 'Did it run?', weight: 0.25 },
      ]),
    );

    const stored = await loadEventCriteria(eventId);
    expect(stored.map((c) => [c.name, c.position, c.weight])).toEqual([
      ['Pitch', 0, 0.25],
      ['Technical depth', 1, 0.5],
      ['Demo', 2, 0.25],
    ]);
    expect(stored[0].id).toBe(pitch.id);
    expect(stored[1].id).toBe(tech.id);

    const data = unwrap(await getJudgingAdmin(eventId));
    expect(data.criteria.map((c) => c.weight)).toEqual([0.25, 0.5, 0.25]);
    expect(data.structureLocked).toBe(false);
  });

  test('weights must add up to 1, and are stored rescaled to exactly 1', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const row = (name: string, weight: number) => ({
      name,
      description: '',
      weight,
    });

    expect(await saveJudgingCriteria(eventId, [row('A', 0.5), row('B', 0.4)])).toEqual({
      success: false,
      error: 'Weights must add up to 1; these add up to 0.9.',
    });
    expect((await saveJudgingCriteria(eventId, [row('A', 0.33), row('B', 0.33), row('C', 0.33)])).success).toBe(false);
    expect((await saveJudgingCriteria(eventId, [row('A', 1.5), row('B', -0.5)])).success).toBe(false);
    expect(await loadEventCriteria(eventId)).toEqual([]);

    // Within the tolerance: saved, rescaled to sum to exactly 1.
    unwrap(await saveJudgingCriteria(eventId, [row('A', 0.333), row('B', 0.333), row('C', 0.333)]));
    const weights = (await loadEventCriteria(eventId)).map((c) => c.weight);
    for (const weight of weights) expect(weight).toBeCloseTo(1 / 3, 12);
    expect(weights.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 12);

    // An empty list has nothing to add up.
    unwrap(await saveJudgingCriteria(eventId, []));
    expect(await loadEventCriteria(eventId)).toEqual([]);
  });

  test('older weights that don’t add up to 1 are shown as shares of their total', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await db.insert(schema.judgingCriteria).values([
      { eventId, name: 'Design', position: 0, weight: 1 },
      { eventId, name: 'Tech', position: 1, weight: 3 },
    ]);
    const data = unwrap(await getJudgingAdmin(eventId));
    expect(data.criteria.map((c) => c.weight)).toEqual([0.25, 0.75]);
  });

  test('rejects invalid input with a message for the form', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const blank = await saveJudgingCriteria(eventId, [{ name: '  ', description: '', weight: 1 }]);
    expect(blank).toEqual({
      success: false,
      error: 'Give every criterion a name.',
    });
    const multiline = await saveJudgingCriteria(eventId, [{ name: 'Design', description: 'one\ntwo', weight: 1 }]);
    expect(multiline.success).toBe(false);
    const unknown = await saveJudgingCriteria(eventId, [
      {
        id: crypto.randomUUID(),
        name: 'Design',
        description: '',
        weight: 1,
      },
    ]);
    expect(unknown.success).toBe(false);
    expect(await loadEventCriteria(eventId)).toEqual([]);
  });

  test('can’t take over another event’s criteria by id', async () => {
    const otherEvent = await makeEvent();
    loginAs(organizer);
    const [theirs] = await addCriteria(otherEvent, ['Theirs']);
    const eventId = await makeEvent();
    const result = await saveJudgingCriteria(eventId, [
      { id: theirs.id, name: 'Mine now', description: '', weight: 1 },
    ]);
    expect(result.success).toBe(false);
    expect((await loadEventCriteria(otherEvent))[0].name).toBe('Theirs');
  });

  test('requires judging:manage:all', async () => {
    const eventId = await makeEvent();
    const outsider = await makeUser('Outsider');
    await grant(outsider.id, ['judging:results:all']);
    loginAs(outsider);
    const result = await saveJudgingCriteria(eventId, [{ name: 'Design', description: '', weight: 1 }]);
    expect(result.success).toBe(false);
    expect(await loadEventCriteria(eventId)).toEqual([]);
    expect((await getJudgingAdmin(eventId)).success).toBe(false);
  });

  test('after the first vote only name, description and weight can change', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const criteria = await addCriteria(eventId, ['Design', 'Tech']);
    const [design, tech] = criteria;
    await makeProjects(eventId, 2);
    const judge = await makeUser('LockJudge');
    await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    const compare = expectKind(await begin(eventId, first.current.id), 'compare');
    await voteAll(eventId, compare, 'current');

    loginAs(organizer);
    expect(unwrap(await getJudgingAdmin(eventId)).structureLocked).toBe(true);
    const rows = asRows(criteria);
    for (const attempt of [
      // Added
      [...rows.map((r) => ({ ...r, weight: 0.4 })), { name: 'More', description: '', weight: 0.2 }],
      // Removed
      [{ ...rows[0], weight: 1 }],
      // Reordered
      [rows[1], rows[0]],
    ]) {
      expect(await saveJudgingCriteria(eventId, attempt)).toEqual({
        success: false,
        error: expect.stringContaining('Judging has started'),
      });
    }

    unwrap(
      await saveJudgingCriteria(
        eventId,
        asRows(criteria, {
          [design.id]: { name: 'Design & UX', weight: 0.7 },
          [tech.id]: { weight: 0.3 },
        }),
      ),
    );
    const stored = await loadEventCriteria(eventId);
    expect(stored.map((c) => [c.id, c.name, c.weight])).toEqual([
      [design.id, 'Design & UX', 0.7],
      [tech.id, 'Tech', 0.3],
    ]);
  });
});

describe('criteria vs. votes', () => {
  /** A judge looking at a comparison, before any vote has been cast. */
  async function readyToVote(names: string[]) {
    const eventId = await makeEvent();
    loginAs(organizer);
    const criteria = await addCriteria(eventId, names);
    await makeProjects(eventId, 3);
    const judge = await makeUser('RaceJudge');
    const judgeId = await rosterJudge(eventId, judge);
    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    const compare = expectKind(await begin(eventId, first.current.id), 'compare');
    return { eventId, criteria, judge, judgeId, compare };
  }

  async function votesBy(judgeId: string) {
    return db.select().from(schema.judgingVotes).where(eq(schema.judgingVotes.judgeId, judgeId));
  }

  /** Holds the event row in `mode` until `release()`; runs `during` first. */
  function holdEventLock(
    eventId: string,
    mode: 'update' | 'key share',
    during: (tx: Tx) => Promise<void> = async () => {},
  ) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let held!: () => void;
    const acquired = new Promise<void>((resolve) => (held = resolve));
    const done = db.transaction(async (tx) => {
      await tx.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, eventId)).for(mode);
      held();
      await released;
      await during(tx);
    });
    return { acquired, release, done };
  }

  test('a vote waits for a criteria save, then asks for the criterion it added', async () => {
    const { eventId, judgeId, compare } = await readyToVote(['Design']);
    const save = holdEventLock(eventId, 'update', async (tx) => {
      await tx.insert(schema.judgingCriteria).values({ eventId, name: 'Late', position: 1, weight: 0 });
    });
    await save.acquired;

    let finished = false;
    const vote = submitJudgeVote(
      eventId,
      voteForm(compare.previous.id, compare.current.id, {
        [compare.criteria[0].id]: 'current',
      }),
    ).finally(() => (finished = true));
    await settle();
    expect(finished).toBe(false);

    save.release();
    await save.done;
    expect(await vote).toEqual({
      success: false,
      error: 'Pick a project for “Late”.',
    });
    expect(await votesBy(judgeId)).toEqual([]);
  });

  test('a criteria save waits for an in-flight first vote, then refuses cleanly', async () => {
    const { eventId, criteria, judgeId, compare } = await readyToVote(['Design', 'Tech']);
    // Stands in for a vote transaction: the shared lock, then a vote on
    // Tech, committed only after the save has started waiting.
    const vote = holdEventLock(eventId, 'key share', async (tx) => {
      await tx.insert(schema.judgingVotes).values({
        judgeId,
        criterionId: criteria[1].id,
        winnerSubmissionId: compare.current.id,
        loserSubmissionId: compare.previous.id,
      });
    });
    await vote.acquired;

    loginAs(organizer);
    let finished = false;
    const save = saveJudgingCriteria(eventId, [{ ...asRows(criteria)[0], weight: 1 }]).finally(() => (finished = true));
    await settle();
    expect(finished).toBe(false);

    vote.release();
    await vote.done;
    expect(await save).toEqual({
      success: false,
      error: expect.stringContaining('Judging has started'),
    });
    expect(await loadEventCriteria(eventId)).toHaveLength(2);
  });

  test('votes don’t wait on each other', async () => {
    const { eventId, judgeId, compare } = await readyToVote(['Design']);
    const other = holdEventLock(eventId, 'key share');
    await other.acquired;
    try {
      unwrap(
        await submitJudgeVote(
          eventId,
          voteForm(compare.previous.id, compare.current.id, {
            [compare.criteria[0].id]: 'current',
          }),
        ),
      );
      expect(await votesBy(judgeId)).toHaveLength(1);
    } finally {
      other.release();
      await other.done;
    }
  });
});

/**
 * An address no earlier run has used: invites claim the shared 60s
 * sign-in-link cooldown per address, which outlives a test run.
 */
function freshEmail(label: string): string {
  counter += 1;
  return `judging-${label}-${counter}-${Date.now()}@example.com`;
}

async function rosterRows(eventId: string) {
  return db
    .select()
    .from(schema.eventJudges)
    .where(eq(schema.eventJudges.eventId, eventId))
    .orderBy(schema.eventJudges.createdAt);
}

async function auditActions(targetId: string): Promise<string[]> {
  const rows = await db
    .select({ action: schema.auditLog.action })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.targetId, targetId));
  return rows.map((row) => row.action);
}

describe('roster', () => {
  // Adding a judge with an invite counts against the organizer's invite rate
  // limit (10 a minute), so each roster test gets an organizer of its own.
  beforeEach(async () => {
    organizer = await makeOrganizer();
  });

  test('adding a judge stores the lowercased email and emails them', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const email = freshEmail('new');
    const result = unwrap(await addEventJudge(eventId, `  ${email.toUpperCase()} `));
    expect(result.invite).toBe('sent');
    expect(sendJudgeInvite).toHaveBeenCalledWith({
      email,
      eventName: 'Judging Test Event',
    });
    const [row] = await rosterRows(eventId);
    expect(row.email).toBe(email);
    expect(row.userId).toBeNull();
    expect(row.inviteSentAt).not.toBeNull();

    const duplicate = await addEventJudge(eventId, email);
    expect(duplicate).toEqual({
      success: false,
      error: 'That email is already on the roster.',
    });
    expect((await addEventJudge(eventId, 'not-an-email')).success).toBe(false);
    // Longer than the column holds: refused for the form, not a 500.
    expect(await addEventJudge(eventId, `${'a'.repeat(250)}@example.com`)).toEqual({
      success: false,
      error: 'That email address is too long.',
    });
  });

  test('an address that already has an account is linked straight away', async () => {
    const eventId = await makeEvent();
    const existing = await makeUser('Existing');
    loginAs(organizer);
    unwrap(await addEventJudge(eventId, existing.email.toUpperCase()));
    const [row] = await rosterRows(eventId);
    expect(row.userId).toBe(existing.id);
  });

  test('a failed invite email still adds the judge, and can be resent at once', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    sendJudgeInvite.mockRejectedValueOnce(new Error('smtp down'));
    const result = unwrap(await addEventJudge(eventId, freshEmail('flaky')));
    expect(result.invite).toBe('failed');
    const data = unwrap(await getJudgingAdmin(eventId));
    expect(data.judges).toHaveLength(1);
    expect(data.judges[0].invited).toBe(false);
    // The failed send gave its cooldown back.
    unwrap(await resendJudgeInvite(eventId, data.judges[0].id));
    expect(sendJudgeInvite).toHaveBeenCalledTimes(2);
    expect(unwrap(await getJudgingAdmin(eventId)).judges[0].invited).toBe(true);
  });

  test('judges can be added without an invite and sent the outstanding ones later', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const [quiet, alsoQuiet, paused, invited] = [
      freshEmail('quiet'),
      freshEmail('also-quiet'),
      freshEmail('paused'),
      freshEmail('invited'),
    ];
    for (const email of [quiet, alsoQuiet, paused]) {
      expect(unwrap(await addEventJudge(eventId, email, { sendInvite: false })).invite).toBe('not_sent');
    }
    unwrap(await addEventJudge(eventId, invited));
    expect(sendJudgeInvite).toHaveBeenCalledTimes(1);

    const before = unwrap(await getJudgingAdmin(eventId)).judges;
    expect(before.map((j) => j.invited)).toEqual([false, false, false, true]);
    unwrap(await setEventJudgeDisabled(eventId, before[2].id, true));
    expect(await resendJudgeInvite(eventId, before[2].id)).toEqual({
      success: false,
      error: 'This judge is disabled. Enable them to send their invite.',
    });
    expect(sendJudgeInvite).toHaveBeenCalledTimes(1);

    sendJudgeInvite.mockClear();
    sendJudgeInvite.mockImplementation(async ({ email }) => {
      if (email === alsoQuiet) throw new Error('smtp down');
    });
    expect(unwrap(await sendOutstandingJudgeInvites(eventId))).toEqual({
      sent: 1,
      failed: 1,
      skipped: 0,
    });
    // Disabled and already-invited judges are left alone.
    expect(sendJudgeInvite.mock.calls.map(([args]) => args.email).sort()).toEqual([alsoQuiet, quiet].sort());
    const rows = await rosterRows(eventId);
    expect(rows.map((row) => row.inviteSentAt != null)).toEqual([true, false, false, true]);
    expect(await auditActions(eventId)).toContain('judging.judge.invites_sent');

    // Only the failed one is still outstanding.
    sendJudgeInvite.mockReset();
    sendJudgeInvite.mockResolvedValue();
    expect(unwrap(await sendOutstandingJudgeInvites(eventId))).toEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    expect(sendJudgeInvite).toHaveBeenCalledTimes(1);
    expect(sendJudgeInvite.mock.calls[0][0].email).toBe(alsoQuiet);
  });

  test('an address sent a sign-in link in the last minute is not emailed again', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const email = freshEmail('cooldown');
    unwrap(await addEventJudge(eventId, email));
    const [row] = await rosterRows(eventId);

    expect(await resendJudgeInvite(eventId, row.id)).toEqual({
      success: false,
      error: 'A sign-in link went to this address in the last minute. Try again shortly.',
    });
    expect(sendJudgeInvite).toHaveBeenCalledTimes(1);

    // Once the cooldown lapses the resend goes out, and is audited.
    await db
      .update(schema.magicLinkCooldown)
      .set({ lastSentAt: new Date(Date.now() - 2 * 60 * 1000) })
      .where(eq(schema.magicLinkCooldown.email, email));
    unwrap(await resendJudgeInvite(eventId, row.id));
    expect(sendJudgeInvite).toHaveBeenCalledTimes(2);
    expect(await auditActions(row.id)).toEqual(
      expect.arrayContaining(['judging.judge.added', 'judging.judge.invite_resent']),
    );

    // A judge who just asked for a sign-in link themselves is skipped by a
    // bulk send and stays outstanding.
    const other = freshEmail('signing-in');
    unwrap(await addEventJudge(eventId, other, { sendInvite: false }));
    await db.insert(schema.magicLinkCooldown).values({ email: other });
    expect(unwrap(await sendOutstandingJudgeInvites(eventId))).toEqual({
      sent: 0,
      failed: 0,
      skipped: 1,
    });
    const otherRow = (await rosterRows(eventId)).find((r) => r.email === other);
    expect(otherRow?.inviteSentAt).toBeNull();
  });

  test('sending invites by hand is rate limited per organizer', async () => {
    const eventId = await makeEvent();
    const busy = await makeUser('BusyOrganizer');
    await grant(busy.id, ['judging:manage:all']);
    loginAs(busy);
    const missing = '00000000-0000-0000-0000-000000000000';
    for (let i = 0; i < 9; i++) {
      expect(await resendJudgeInvite(eventId, missing)).toEqual({
        success: false,
        error: 'Judge not found.',
      });
    }
    unwrap(await sendOutstandingJudgeInvites(eventId));
    for (const result of [await resendJudgeInvite(eventId, missing), await sendOutstandingJudgeInvites(eventId)]) {
      expect(result).toEqual({
        success: false,
        error: 'You’ve sent a lot of invites in the last minute. Wait a moment and try again.',
      });
    }

    // Adding a judge counts too: they're still added, but their invite waits
    // for "Send outstanding invites".
    const limited = freshEmail('limited');
    expect(unwrap(await addEventJudge(eventId, limited)).invite).toBe('rate_limited');
    expect(sendJudgeInvite).not.toHaveBeenCalled();
    const [row] = await rosterRows(eventId);
    expect(row.email).toBe(limited);
    expect(row.inviteSentAt).toBeNull();
  });

  test('an event’s own participants can’t be added as its judges', async () => {
    const eventId = await makeEvent({ hasApplication: false });
    const registered = await makeUser('Registered');
    loginAs(registered);
    unwrap(await registerForEvent(eventId));

    const teamed = await makeUser('Teamed');
    const [team] = await db
      .insert(schema.teams)
      .values({ eventId, code: `T${String(counter++).padStart(7, '0')}` })
      .returning({ id: schema.teams.id });
    await db.insert(schema.teamMembers).values({ teamId: team.id, userId: teamed.id, eventId });

    loginAs(organizer);
    for (const person of [registered, teamed]) {
      expect(await addEventJudge(eventId, person.email)).toEqual({
        success: false,
        error: 'That person is taking part in this event, so they can’t judge it.',
      });
    }
    expect(await rosterRows(eventId)).toHaveLength(0);
    expect(sendJudgeInvite).not.toHaveBeenCalled();

    // Someone turned away is free to judge.
    await db
      .update(schema.eventParticipants)
      .set({ statusId: Participation.statusIdOf('declined') })
      .where(and(eq(schema.eventParticipants.eventId, eventId), eq(schema.eventParticipants.userId, registered.id)));
    unwrap(await addEventJudge(eventId, registered.email));
  });

  test('the roster says who has actually signed in and started judging', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 2);
    const judge = await makeUser('Status');
    const old = new Date(Date.now() - HOUR);
    // Signed in long before being added, and an admin impersonating them
    // since: neither counts.
    await db.insert(schema.session).values([
      {
        userId: judge.id,
        token: `old-${judge.id}`,
        expiresAt: new Date(Date.now() + HOUR),
        createdAt: old,
        updatedAt: old,
      },
      {
        userId: judge.id,
        token: `imp-${judge.id}`,
        expiresAt: new Date(Date.now() + HOUR),
        impersonatedBy: organizer.id,
      },
    ]);

    unwrap(await addEventJudge(eventId, judge.email, { sendInvite: false }));
    const status = async () => {
      const [row] = unwrap(await getJudgingAdmin(eventId)).judges;
      return {
        invited: row.invited,
        signedIn: row.signedIn,
        startedJudging: row.startedJudging,
      };
    };
    // Linked at add time, but that's not a sign-in.
    expect((await rosterRows(eventId))[0].userId).toBe(judge.id);
    expect(await status()).toEqual({
      invited: false,
      signedIn: false,
      startedJudging: false,
    });

    await db.insert(schema.session).values({
      userId: judge.id,
      token: `new-${judge.id}`,
      expiresAt: new Date(Date.now() + HOUR),
    });
    expect(await status()).toMatchObject({
      signedIn: true,
      startedJudging: false,
    });

    loginAs(judge);
    expectKind(await Judging.getJudgeView(eventId), 'begin');
    loginAs(organizer);
    expect(await status()).toMatchObject({ startedJudging: true });
  });

  test('sign-in links a roster row added by email', async () => {
    const eventId = await makeEvent();
    const later = await makeUser('Later');
    await rosterJudge(eventId, later, { link: false });
    await Judging.linkJudgeRosterRows(later.id);
    const [row] = await db.select().from(schema.eventJudges).where(eq(schema.eventJudges.eventId, eventId));
    expect(row.userId).toBe(later.id);
  });

  test('a judge can only be removed while they have no votes', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 2);
    const voter = await makeUser('Voter');
    const idle = await makeUser('Idle');
    const voterId = await rosterJudge(eventId, voter);
    const idleId = await rosterJudge(eventId, idle);

    loginAs(voter);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    await voteAll(eventId, expectKind(await begin(eventId, first.current.id), 'compare'), 'previous');

    loginAs(organizer);
    expect((await removeEventJudge(eventId, voterId)).success).toBe(false);
    unwrap(await removeEventJudge(eventId, idleId));
    const remaining = unwrap(await getJudgingAdmin(eventId)).judges;
    expect(remaining.map((j) => j.id)).toEqual([voterId]);
    expect(remaining[0].comparisons).toBe(1);
  });
});

/** Adds `email` to the roster as the organizer, without emailing it. */
async function addJudgeWithoutInvite(eventId: string, email: string) {
  loginAs(organizer);
  unwrap(await addEventJudge(eventId, email, { sendInvite: false }));
  const row = (await rosterRows(eventId)).find((r) => r.email === email);
  return { judgeId: row!.id };
}

/** Requests a judge's sign-in QR code from the route, as the logged-in user. */
function requestSignInQr(eventId: string, judgeId: string, headers?: HeadersInit) {
  return getSignInQr(new Request('http://localhost/', { headers }), {
    params: Promise.resolve({ eventId, judgeId }),
  });
}

describe('sign-in QR codes', () => {
  test('need their own permission, not just judging:manage:all', async () => {
    const eventId = await makeEvent();
    const email = freshEmail('qr-denied');
    const { judgeId } = await addJudgeWithoutInvite(eventId, email);
    loginAs(organizer);
    expect((await requestSignInQr(eventId, judgeId)).status).toBe(403);
    expect(createJudgeSignInLink).not.toHaveBeenCalled();
  });

  test("stream a QR of the judge's link and audit it", async () => {
    const eventId = await makeEvent();
    const email = freshEmail('qr');
    const { judgeId } = await addJudgeWithoutInvite(eventId, email);
    const admin = await makeUser('QrAdmin');
    await grant(admin.id, ['judging:signin:all']);
    loginAs(admin);

    const before = Date.now();
    const response = await requestSignInQr(eventId, judgeId);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.text()).toContain('<svg');
    expect(createJudgeSignInLink).toHaveBeenCalledWith(email);
    // A QR code doesn't count as the invite going out.
    const [row] = (await rosterRows(eventId)).filter((r) => r.id === judgeId);
    expect(row.inviteSentAt).toBeNull();

    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, 'judging.judge.signin_qr_created'), eq(schema.auditLog.targetId, judgeId)));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: admin.id,
      targetType: 'event_judge',
      metadata: { eventId, email },
    });
    const { expiresAt } = audits[0].metadata as { expiresAt: string };
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(before);
  });

  test('refuse prefetches without minting or auditing', async () => {
    const eventId = await makeEvent();
    const { judgeId } = await addJudgeWithoutInvite(eventId, freshEmail('qr-prefetch'));
    const admin = await makeUser('QrAdmin');
    await grant(admin.id, ['judging:signin:all']);
    loginAs(admin);
    for (const headers of [
      ['Next-Router-Prefetch', '1'],
      ['Sec-Purpose', 'prefetch'],
      ['Sec-Purpose', 'prefetch;prerender'],
      ['Purpose', 'prefetch'],
      ['X-Moz', 'prefetch'],
    ] satisfies [string, string][]) {
      expect((await requestSignInQr(eventId, judgeId, [headers])).status).toBe(403);
    }
    expect(createJudgeSignInLink).not.toHaveBeenCalled();
    expect(
      await db
        .select()
        .from(schema.auditLog)
        .where(
          and(eq(schema.auditLog.action, 'judging.judge.signin_qr_created'), eq(schema.auditLog.targetId, judgeId)),
        ),
    ).toHaveLength(0);
  });

  test("won't serve another event's judge", async () => {
    const eventId = await makeEvent();
    const other = await makeEvent();
    const { judgeId } = await addJudgeWithoutInvite(eventId, freshEmail('qr-other-event'));
    const admin = await makeUser('QrAdmin');
    await grant(admin.id, ['judging:signin:all']);
    loginAs(admin);
    expect((await requestSignInQr(other, judgeId)).status).toBe(404);
    expect(createJudgeSignInLink).not.toHaveBeenCalled();
  });

  test('refuse a disabled judge, and audit nothing on failure', async () => {
    const eventId = await makeEvent();
    const { judgeId } = await addJudgeWithoutInvite(eventId, freshEmail('qr-disabled'));
    unwrap(await setEventJudgeDisabled(eventId, judgeId, true));
    const admin = await makeUser('QrAdmin');
    await grant(admin.id, ['judging:signin:all']);
    loginAs(admin);
    expect((await requestSignInQr(eventId, judgeId)).status).toBe(409);

    loginAs(organizer);
    unwrap(await setEventJudgeDisabled(eventId, judgeId, false));
    loginAs(admin);
    createJudgeSignInLink.mockRejectedValueOnce(new Error('auth down'));
    expect((await requestSignInQr(eventId, judgeId)).status).toBe(500);
    expect(
      await db
        .select()
        .from(schema.auditLog)
        .where(
          and(eq(schema.auditLog.action, 'judging.judge.signin_qr_created'), eq(schema.auditLog.targetId, judgeId)),
        ),
    ).toHaveLength(0);
  });
});

describe('signing up', () => {
  test('a judge cannot register for the event they judge', async () => {
    const eventId = await makeEvent({ hasApplication: false });
    const other = await makeEvent({ hasApplication: false });
    const judge = await makeUser('NoSignup');
    const judgeId = await rosterJudge(eventId, judge, { link: false });
    loginAs(judge);

    // Matched by email before the roster row is linked, and still a judge
    // once paused.
    expect(await registerForEvent(eventId)).toEqual({
      success: false,
      error: 'You’re judging this event, so you can’t also sign up for it.',
    });
    await db
      .update(schema.eventJudges)
      .set({ userId: judge.id, disabledAt: new Date() })
      .where(eq(schema.eventJudges.id, judgeId));
    expect((await registerForEvent(eventId)).success).toBe(false);
    expect(
      await db.select().from(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventId)),
    ).toHaveLength(0);

    // Other events are unaffected.
    unwrap(await registerForEvent(other));
  });
});

describe('judge flow', () => {
  test('only rostered judges get in', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    const stranger = await makeUser('Stranger');
    loginAs(stranger);
    expect((await Judging.getJudgeView(eventId)).kind).toBe('not_judge');
  });

  test('an unlinked roster row matches the signed-in email', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 1);
    const judge = await makeUser('Unlinked');
    await rosterJudge(eventId, judge, { link: false });
    loginAs(judge);
    expect((await Judging.getJudgeView(eventId)).kind).toBe('begin');
  });

  test('judging is only open between the event start and end', async () => {
    const now = Date.now();
    const future = await makeEvent({
      startsAt: new Date(now + HOUR),
      submissionsCloseAt: new Date(now + 2 * HOUR),
      endsAt: new Date(now + 3 * HOUR),
    });
    const past = await makeEvent({
      startsAt: new Date(now - 3 * HOUR),
      submissionsCloseAt: new Date(now - 2 * HOUR),
      endsAt: new Date(now - HOUR),
    });
    const judge = await makeUser('Window');
    await rosterJudge(future, judge);
    await rosterJudge(past, judge);
    loginAs(judge);
    expect((await Judging.getJudgeView(future)).kind).toBe('not_open');
    expect((await Judging.getJudgeView(past)).kind).toBe('closed');
  });

  test('no dispatch until the event has a criterion', async () => {
    const eventId = await makeEvent();
    await makeProjects(eventId, 2);
    const judge = await makeUser('NoCriteria');
    await rosterJudge(eventId, judge);
    loginAs(judge);
    expect((await Judging.getJudgeView(eventId)).kind).toBe('no_criteria');
  });

  test('begin, then compare on every criterion, updating votes and scores', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const criteria = await addCriteria(eventId, ['Design', 'Tech']);
    const projects = await makeProjects(eventId, 3);
    const judge = await makeUser('Walker');
    const judgeId = await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    expect(projects).toContain(first.current.id);
    expect(first.current.tableLabel).toBe(String(projects.indexOf(first.current.id) + 1));
    // Reloading keeps the same assignment.
    expect(expectKind(await Judging.getJudgeView(eventId), 'begin').current.id).toBe(first.current.id);

    const compare = expectKind(await begin(eventId, first.current.id), 'compare');
    expect(compare.previous.id).toBe(first.current.id);
    expect(compare.current.id).not.toBe(first.current.id);
    expect(compare.criteria.map((c) => c.name)).toEqual(['Design', 'Tech']);
    expect(compare.criteria[0].description).toBe('Design, briefly');

    // Missing a criterion is refused.
    const partial = await submitJudgeVote(
      eventId,
      voteForm(compare.previous.id, compare.current.id, {
        [criteria[0].id]: 'current',
      }),
    );
    expect(partial.success).toBe(false);

    const next = await voteAll(eventId, compare, 'current');
    const votes = await db.select().from(schema.judgingVotes).where(eq(schema.judgingVotes.judgeId, judgeId));
    expect(votes).toHaveLength(2);
    expect(votes.every((v) => v.winnerSubmissionId === compare.current.id)).toBe(true);
    const scores = await db
      .select()
      .from(schema.submissionScores)
      .where(eq(schema.submissionScores.submissionId, compare.current.id));
    expect(scores).toHaveLength(2);
    expect(scores.every((s) => s.mu > 0)).toBe(true);

    // The third project is compared against the one just voted on.
    const third = expectKind(next, 'compare');
    expect(third.previous.id).toBe(compare.current.id);
    const remaining = projects.filter((id) => id !== first.current.id && id !== compare.current.id);
    expect(third.current.id).toBe(remaining[0]);

    // Nothing left: the judge waits.
    expect((await voteAll(eventId, third, 'previous')).kind).toBe('waiting');
  });

  test('a repeated vote (double tap, second tab) is not recorded twice', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 3);
    const judge = await makeUser('DoubleTap');
    const judgeId = await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    const compare = expectKind(await begin(eventId, first.current.id), 'compare');
    await Promise.all([voteAll(eventId, compare, 'current'), voteAll(eventId, compare, 'current')]);
    const votes = await db.select().from(schema.judgingVotes).where(eq(schema.judgingVotes.judgeId, judgeId));
    expect(votes).toHaveLength(1);
  });

  test('a conflict skip never comes back; not-here is retried later', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    const [only] = await makeProjects(eventId, 1);
    const judge = await makeUser('Skipper');
    const judgeId = await rosterJudge(eventId, judge);

    loginAs(judge);
    expectKind(await Judging.getJudgeView(eventId), 'begin');
    const afterNotHere = await skip(eventId, only, 'not_here');
    expect(afterNotHere.kind).toBe('waiting');

    // Ten minutes on, the team may be back.
    await db.execute(`UPDATE judge_skips SET created_at = now() - interval '11 minutes' WHERE judge_id = '${judgeId}'`);
    expect(expectKind(await Judging.getJudgeView(eventId), 'begin').current.id).toBe(only);

    const afterConflict = await skip(eventId, only, 'conflict');
    expect(afterConflict.kind).toBe('waiting');
    await db.execute(`UPDATE judge_skips SET created_at = now() - interval '1 day' WHERE judge_id = '${judgeId}'`);
    expect((await Judging.getJudgeView(eventId)).kind).toBe('waiting');
  });

  test('“not here” is timed on the app’s clock, like the busy window', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    const [only] = await makeProjects(eventId, 1);
    const judge = await makeUser('Clock');
    await rosterJudge(eventId, judge);

    loginAs(judge);
    expectKind(await Judging.getJudgeView(eventId), 'begin');
    // The app server's clock runs five minutes ahead of the database's.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 5 * MINUTE);
      expect((await skip(eventId, only, 'not_here')).kind).toBe('waiting');
      vi.setSystemTime(Date.now() + 6 * MINUTE);
      expect((await Judging.getJudgeView(eventId)).kind).toBe('waiting');
      vi.setSystemTime(Date.now() + 5 * MINUTE);
      expect(expectKind(await Judging.getJudgeView(eventId), 'begin').current.id).toBe(only);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a judge is never sent back to a project they’ve been at, vote or no vote', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 3);
    const judge = await makeUser('Revisit');
    await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    const compare = expectKind(await begin(eventId, first.current.id), 'compare');
    // Both leave the pool while the judge is at the second: the vote is
    // dropped, and with nothing left to compare against they begin afresh.
    const visited = [compare.previous.id, compare.current.id];
    loginAs(organizer);
    for (const id of visited) {
      unwrap(await setSubmissionDeactivated(eventId, id, true));
    }
    loginAs(judge);
    const restart = expectKind(await voteAll(eventId, compare, 'current'), 'begin');
    expect(visited).not.toContain(restart.current.id);

    // Back in the pool, but this judge has been at both already.
    loginAs(organizer);
    for (const id of visited) {
      unwrap(await setSubmissionDeactivated(eventId, id, false));
    }
    loginAs(judge);
    expect((await begin(eventId, restart.current.id)).kind).toBe('waiting');
  });

  test('a judge disabled while their vote is in flight records nothing', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 3);
    const judge = await makeUser('DisabledMidVote');
    const judgeId = await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    const compare = expectKind(await begin(eventId, first.current.id), 'compare');
    // The organizer's Disable, committed only once the vote is under way.
    const disabling = holdTransaction(async (tx) => {
      await tx.update(schema.eventJudges).set({ disabledAt: new Date() }).where(eq(schema.eventJudges.id, judgeId));
    });
    await disabling.acquired;
    const vote = submitJudgeVote(
      eventId,
      voteForm(compare.previous.id, compare.current.id, {
        [compare.criteria[0].id]: 'current',
      }),
    );
    await settle();
    disabling.release();
    await disabling.done;

    expect((await vote).success).toBe(true);
    expect(await db.select().from(schema.judgingVotes).where(eq(schema.judgingVotes.judgeId, judgeId))).toEqual([]);
    expect((await Judging.getJudgeView(eventId)).kind).toBe('disabled');
  });

  test('a judge removed while their request is in flight is told so, without an error', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 2);
    const judge = await makeUser('RemovedMidRequest');
    const judgeId = await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    // The organizer's Remove, committed only once Begin is under way.
    const removing = holdTransaction(async (tx) => {
      await tx.delete(schema.eventJudges).where(eq(schema.eventJudges.id, judgeId));
    });
    await removing.acquired;
    const begun = beginJudging(eventId, formData({ currentId: first.current.id }));
    await settle();
    removing.release();
    await removing.done;

    expect((await begun).success).toBe(true);
    expect((await Judging.getJudgeView(eventId)).kind).toBe('not_judge');
  });

  test('a project another judge was just sent to is not sent to a second', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 2);
    const a = await makeUser('BusyA');
    const b = await makeUser('BusyB');
    await rosterJudge(eventId, a);
    await rosterJudge(eventId, b);

    loginAs(a);
    const viewA = expectKind(await Judging.getJudgeView(eventId), 'begin');
    loginAs(b);
    const viewB = expectKind(await Judging.getJudgeView(eventId), 'begin');
    expect(viewB.current.id).not.toBe(viewA.current.id);
  });

  test('deactivated and unpublished projects are never dispatched', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    const [kept, dropped] = await makeProjects(eventId, 2);
    await makeProjects(eventId, 1, { published: false });
    unwrap(await setSubmissionDeactivated(eventId, dropped, true));

    const judge = await makeUser('Pool');
    await rosterJudge(eventId, judge);
    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    expect(first.current.id).toBe(kept);
    expect((await begin(eventId, kept)).kind).toBe('waiting');
  });

  test('a project deactivated mid-visit is skipped without recording votes', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 3);
    const judge = await makeUser('MidVisit');
    const judgeId = await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    const compare = expectKind(await begin(eventId, first.current.id), 'compare');
    loginAs(organizer);
    unwrap(await setSubmissionDeactivated(eventId, compare.current.id, true));
    loginAs(judge);
    await voteAll(eventId, compare, 'current');
    expect(await db.select().from(schema.judgingVotes).where(eq(schema.judgingVotes.judgeId, judgeId))).toHaveLength(0);
  });

  test('a disabled judge is not dispatched', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 2);
    const judge = await makeUser('Disabled');
    const judgeId = await rosterJudge(eventId, judge);
    unwrap(await setEventJudgeDisabled(eventId, judgeId, true));
    loginAs(judge);
    expect((await Judging.getJudgeView(eventId)).kind).toBe('disabled');
  });

  test('a judge who ended up on a team is never sent to its project', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    const [own, other] = await makeProjects(eventId, 2);
    const judge = await makeUser('OnATeam');
    // Unlinked: matched to the team member by email, as before sign-in.
    await rosterJudge(eventId, judge, { link: false });
    const [ownSubmission] = await db
      .select({ teamId: schema.submissions.teamId })
      .from(schema.submissions)
      .where(eq(schema.submissions.id, own));
    await db.insert(schema.teamMembers).values({ teamId: ownSubmission.teamId, userId: judge.id, eventId });

    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    expect(first.current.id).toBe(other);
    // Nothing else to compare it with.
    expect((await begin(eventId, other)).kind).toBe('waiting');
  });
});

describe('results and awards', () => {
  async function runExpo() {
    const eventId = await makeEvent();
    loginAs(organizer);
    const criteria = await addCriteria(eventId, ['Design', 'Tech']);
    const projects = await makeProjects(eventId, 3);
    const judge = await makeUser('Ranker');
    const judgeId = await rosterJudge(eventId, judge);

    // Project 1 beats everything on both criteria.
    loginAs(judge);
    let view = await Judging.getJudgeView(eventId);
    view = await begin(eventId, expectKind(view, 'begin').current.id);
    while (view.kind === 'compare') {
      const best = projects[0];
      const side = view.previous.id === best ? 'previous' : 'current';
      view = await voteAll(eventId, view, side);
    }
    return { eventId, criteria, projects, judgeId };
  }

  test('ranks projects by replaying the in-pool votes', async () => {
    const { eventId, criteria, projects, judgeId } = await runExpo();
    loginAs(organizer);
    const results = unwrap(await getJudgingResults(eventId));
    expect(results.canViewRankings).toBe(true);
    expect(results.provisional).toBe(true);
    expect(results.overall[0].id).toBe(projects[0]);
    expect(results.overall[0].score).toBeGreaterThan(0);
    expect(results.byCriterion.map((c) => c.id)).toEqual(criteria.map((c) => c.id));
    expect(results.byCriterion[0].rows[0].id).toBe(projects[0]);
    expect(results.judges).toHaveLength(1);
    expect(results.judges[0].id).toBe(judgeId);
    expect(results.judges[0].comparisons).toBe(2);
  });

  test('a deactivated project drops out of results without skewing the rest', async () => {
    const { eventId, projects } = await runExpo();
    loginAs(organizer);
    unwrap(await setSubmissionDeactivated(eventId, projects[0], true));
    const results = unwrap(await getJudgingResults(eventId));
    expect(results.overall.map((p) => p.id)).not.toContain(projects[0]);
    // Only the comparison between the remaining two counts, if there was one.
    for (const row of results.byCriterion[0].rows) {
      expect(row.comparisons).toBeLessThanOrEqual(1);
    }
  });

  test('weights only re-sort the Overall table', async () => {
    const { eventId, criteria } = await runExpo();
    loginAs(organizer);
    const before = unwrap(await getJudgingResults(eventId));
    unwrap(
      await saveJudgingCriteria(
        eventId,
        asRows(criteria, {
          [criteria[0].id]: { weight: 0.8 },
          [criteria[1].id]: { weight: 0.2 },
        }),
      ),
    );
    const after = unwrap(await getJudgingResults(eventId));
    expect(after.byCriterion).toEqual(
      before.byCriterion.map((table) => ({
        ...table,
        weight: table.id === criteria[0].id ? 0.8 : 0.2,
      })),
    );
  });

  test('award-only organizers see projects by table, without rankings', async () => {
    const { eventId } = await runExpo();
    const awarder = await makeUser('Awarder');
    await grant(awarder.id, ['judging:award:all']);
    loginAs(awarder);
    const results = unwrap(await getJudgingResults(eventId));
    expect(results.canViewRankings).toBe(false);
    expect(results.canAward).toBe(true);
    expect(results.byCriterion).toEqual([]);
    expect(results.judges).toEqual([]);
    expect(results.overall.every((row) => row.score === undefined)).toBe(true);
    expect(results.overall.map((row) => row.tableLabel)).toEqual(['1', '2', '3']);
  });

  test('criterion weights are reported as shares, even if stored at 1 each', async () => {
    const eventId = await makeEvent();
    await db.insert(schema.judgingCriteria).values([
      { eventId, name: 'Old A', position: 0, weight: 1 },
      { eventId, name: 'Old B', position: 1, weight: 1 },
    ]);
    loginAs(organizer);
    const results = unwrap(await getJudgingResults(eventId));
    expect(results.byCriterion.map((c) => c.weight)).toEqual([0.5, 0.5]);
  });

  test('results require a results or award permission', async () => {
    const { eventId } = await runExpo();
    const manager = await makeUser('ManagerOnly');
    await grant(manager.id, ['judging:manage:all']);
    loginAs(manager);
    expect((await getJudgingResults(eventId)).success).toBe(false);
  });

  test('replays votes in the order they reached the model, not the order they began', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const [criterion] = await addCriteria(eventId, ['Design']);
    const [a, b, c] = await makeProjects(eventId, 3);
    const first = await makeUser('SlowVoter');
    const second = await makeUser('FastVoter');
    const firstId = await rosterJudge(eventId, first);
    const secondId = await rosterJudge(eventId, second);
    // Both judges are at B: the first came from A, the second from C.
    await db.insert(schema.judgeState).values([
      {
        judgeId: firstId,
        previousSubmissionId: a,
        currentSubmissionId: b,
        assignedAt: new Date(),
      },
      {
        judgeId: secondId,
        previousSubmissionId: c,
        currentSubmissionId: b,
        assignedAt: new Date(),
      },
    ]);

    // The first judge's vote starts, then stalls on its own state row; the
    // second's starts later, but updates B first.
    const stall = holdTransaction(async (tx) => {
      await tx.select().from(schema.judgeState).where(eq(schema.judgeState.judgeId, firstId)).for('update');
    });
    await stall.acquired;
    loginAs(first);
    const slow = submitJudgeVote(eventId, voteForm(a, b, { [criterion.id]: 'previous' }));
    await settle();
    loginAs(second);
    unwrap(await submitJudgeVote(eventId, voteForm(c, b, { [criterion.id]: 'current' })));
    stall.release();
    await stall.done;
    unwrap(await slow);

    const votes = await db
      .select()
      .from(schema.judgingVotes)
      .where(inArray(schema.judgingVotes.judgeId, [firstId, secondId]));
    const slowVote = votes.find((v) => v.judgeId === firstId)!;
    const fastVote = votes.find((v) => v.judgeId === secondId)!;
    expect(slowVote.createdAt.getTime()).toBeLessThan(fastVote.createdAt.getTime());
    expect(slowVote.seq).toBeGreaterThan(fastVote.seq);

    // So the replay lands exactly where the online model did.
    loginAs(organizer);
    const results = unwrap(await getJudgingResults(eventId));
    const online = await db
      .select()
      .from(schema.submissionScores)
      .where(eq(schema.submissionScores.criterionId, criterion.id));
    for (const row of results.byCriterion[0].rows) {
      const live = online.find((s) => s.submissionId === row.id)!;
      expect([row.mu, row.sigmaSq]).toEqual([live.mu, live.sigmaSq]);
    }
  });

  test('a project deactivated while it’s being placed doesn’t keep the place', async () => {
    const { eventId, projects } = await runExpo();
    loginAs(organizer);
    // Deactivation in flight: the row is updated but not yet committed.
    const deactivating = holdTransaction(async (tx) => {
      await tx
        .update(schema.submissions)
        .set({ deactivatedAt: new Date(), placement: null })
        .where(eq(schema.submissions.id, projects[0]));
    });
    await deactivating.acquired;
    const placing = setSubmissionPlacement(eventId, projects[0], 1);
    await settle();
    deactivating.release();
    await deactivating.done;

    expect(await placing).toEqual({
      success: false,
      error: 'That project isn’t in the judging results.',
    });
    const [row] = await db
      .select({ placement: schema.submissions.placement })
      .from(schema.submissions)
      .where(eq(schema.submissions.id, projects[0]));
    expect(row?.placement).toBeNull();
  });

  test('unique placements', async () => {
    const { eventId, projects } = await runExpo();
    loginAs(organizer);
    unwrap(await setSubmissionPlacement(eventId, projects[0], 1));
    const taken = await setSubmissionPlacement(eventId, projects[1], 1);
    expect(taken).toEqual({
      success: false,
      error: '“Project 1” already holds place 1.',
    });
    expect((await setSubmissionPlacement(eventId, projects[1], 0)).success).toBe(false);
    unwrap(await setSubmissionPlacement(eventId, projects[1], 2));
    unwrap(await setSubmissionPlacement(eventId, projects[0], null));
    unwrap(await setSubmissionPlacement(eventId, projects[1], 1));

    const results = unwrap(await getJudgingResults(eventId));
    const byId = new Map(results.overall.map((row) => [row.id, row]));
    expect(byId.get(projects[0])?.placement).toBeNull();
    expect(byId.get(projects[1])?.placement).toBe(1);

    const resultsOnly = await makeUser('ResultsOnly');
    await grant(resultsOnly.id, ['judging:results:all']);
    loginAs(resultsOnly);
    expect((await setSubmissionPlacement(eventId, projects[2], 2)).success).toBe(false);
  });

  test('deactivating a placed project frees its place', async () => {
    const { eventId, projects } = await runExpo();
    loginAs(organizer);
    unwrap(await setSubmissionPlacement(eventId, projects[0], 1));
    unwrap(await setSubmissionDeactivated(eventId, projects[0], true));

    const [row] = await db
      .select({ placement: schema.submissions.placement })
      .from(schema.submissions)
      .where(eq(schema.submissions.id, projects[0]));
    expect(row?.placement).toBeNull();
    // The place it held can go to someone else straight away…
    unwrap(await setSubmissionPlacement(eventId, projects[1], 1));
    // …and a project outside the results can't be placed, only cleared.
    expect((await setSubmissionPlacement(eventId, projects[0], 2)).success).toBe(false);
    unwrap(await setSubmissionPlacement(eventId, projects[0], null));
  });
});

describe('table numbers', () => {
  test('are handed out at first publish and never shift', async () => {
    const eventId = await makeEvent();
    const [a, draft, b] = [
      ...(await makeProjects(eventId, 1)),
      ...(await makeProjects(eventId, 1, { published: false })),
      ...(await makeProjects(eventId, 1)),
    ];
    const label = async (id: string) => (await Judging.getTableLabels(eventId)).get(id)?.label;
    // A draft has no table, so it leaves no gap.
    expect([await label(a), await label(draft), await label(b)]).toEqual(['1', undefined, '2']);

    // Deleting a project leaves the others where they are, and its table is
    // never handed out again.
    await db.delete(schema.submissions).where(eq(schema.submissions.id, a));
    await Judging.assignTableSlot(db, eventId, draft);
    expect(await label(b)).toBe('2');
    expect(await label(draft)).toBe('3');
    // Republishing keeps the table it already has.
    await Judging.assignTableSlot(db, eventId, draft);
    expect(await label(draft)).toBe('3');
  });

  test('concurrent publishes never share a table', async () => {
    const eventId = await makeEvent();
    const drafts = await makeProjects(eventId, 6, { published: false });
    await Promise.all(drafts.map((id) => db.transaction((tx) => Judging.assignTableSlot(tx, eventId, id))));
    const slots = [...(await Judging.getTableLabels(eventId)).values()].map((t) => t.slot).sort((x, y) => x - y);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('the layout labels tables, until judging starts', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const projects = await makeProjects(eventId, 4);
    unwrap(
      await updateJudgingTableLayout(eventId, {
        rows: 2,
        rowAlphabet: 'roman',
        columnAlphabet: 'arabic',
      }),
    );
    const admin = unwrap(await getJudgingAdmin(eventId));
    expect(admin.tableLayout).toEqual({
      rows: 2,
      rowAlphabet: 'roman',
      columnAlphabet: 'arabic',
    });
    const rows = unwrap(await getJudgingProjects(eventId));
    expect(projects.map((id) => rows.find((row) => row.id === id)?.tableLabel)).toEqual(['I-1', 'II-1', 'I-2', 'II-2']);

    expect(
      (
        await updateJudgingTableLayout(eventId, {
          rows: 0,
          rowAlphabet: 'latin',
          columnAlphabet: 'arabic',
        })
      ).success,
    ).toBe(false);

    const manager = await makeUser('NoLayout');
    await grant(manager.id, ['judging:results:all']);
    loginAs(manager);
    expect(
      (
        await updateJudgingTableLayout(eventId, {
          rows: 1,
          rowAlphabet: 'latin',
          columnAlphabet: 'arabic',
        })
      ).success,
    ).toBe(false);

    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    const judge = await makeUser('LayoutJudge');
    await rosterJudge(eventId, judge);
    // A judge on the roster hasn't been sent anywhere yet.
    expect(unwrap(await getJudgingAdmin(eventId)).layoutLocked).toBe(false);
    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    expect(first.current.tableLabel).toMatch(/^I{1,2}-[12]$/);

    // Sent to a table, no vote yet: the label they were given has to hold.
    loginAs(organizer);
    expect(
      await updateJudgingTableLayout(eventId, {
        rows: 1,
        rowAlphabet: 'latin',
        columnAlphabet: 'arabic',
      }),
    ).toEqual({
      success: false,
      error: 'Judging has started, so the table layout can no longer change.',
    });
    const locked = unwrap(await getJudgingAdmin(eventId));
    expect(locked.layoutLocked).toBe(true);
    // Criteria stay editable until the first vote.
    expect(locked.structureLocked).toBe(false);
  });

  test('a judge with nowhere to go doesn’t lock the layout', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 1, { published: false });
    const judge = await makeUser('NowhereToGo');
    await rosterJudge(eventId, judge);
    loginAs(judge);
    // Opening the judging screen gives them a state row, but no table.
    expect((await Judging.getJudgeView(eventId)).kind).toBe('waiting');

    loginAs(organizer);
    expect(unwrap(await getJudgingAdmin(eventId)).layoutLocked).toBe(false);
    unwrap(
      await updateJudgingTableLayout(eventId, {
        rows: 2,
        rowAlphabet: 'latin',
        columnAlphabet: 'arabic',
      }),
    );
  });

  test('a first dispatch waits for a layout save, then shows the new labels', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    const [project] = await makeProjects(eventId, 1);
    const judge = await makeUser('SentDuringSave');
    await rosterJudge(eventId, judge);
    // Stands in for a layout save: the event row FOR UPDATE and the new
    // layout, committed only once the judge's screen is waiting on it.
    const save = holdTransaction(async (tx) => {
      await tx.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, eventId)).for('update');
      await tx
        .update(schema.events)
        .set({
          judgingTableRows: 2,
          judgingTableRowAlphabet: 'roman',
          judgingTableColumnAlphabet: 'arabic',
        })
        .where(eq(schema.events.id, eventId));
    });
    await save.acquired;

    loginAs(judge);
    let finished = false;
    const view = Judging.getJudgeView(eventId).finally(() => (finished = true));
    await settle();
    expect(finished).toBe(false);

    save.release();
    await save.done;
    expect(expectKind(await view, 'begin').current).toMatchObject({
      id: project,
      tableLabel: 'I-1',
    });
  });

  test('a layout save waits for a dispatch in flight, then refuses', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    const [project] = await makeProjects(eventId, 1);
    const judge = await makeUser('FirstSent');
    const judgeId = await rosterJudge(eventId, judge);
    // Stands in for a judge's first dispatch: the shared lock, then an
    // assignment, committed only after the save has started waiting.
    const dispatch = holdTransaction(async (tx) => {
      await tx
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .for('key share');
      await tx.insert(schema.judgeState).values({
        judgeId,
        currentSubmissionId: project,
        assignedAt: new Date(),
      });
    });
    await dispatch.acquired;

    let finished = false;
    const save = updateJudgingTableLayout(eventId, {
      rows: 2,
      rowAlphabet: 'latin',
      columnAlphabet: 'arabic',
    }).finally(() => (finished = true));
    await settle();
    expect(finished).toBe(false);

    dispatch.release();
    await dispatch.done;
    expect(await save).toEqual({
      success: false,
      error: 'Judging has started, so the table layout can no longer change.',
    });
  });
});

describe('account deletion', () => {
  test('a deleted judge keeps their votes under a pseudonym', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 2);
    const judge = await makeUser('Leaver');
    const judgeId = await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    await voteAll(eventId, expectKind(await begin(eventId, first.current.id), 'compare'), 'current');

    await prepareUserDeletion(judge.id);
    await db.delete(schema.user).where(eq(schema.user.id, judge.id));

    const [row] = await db.select().from(schema.eventJudges).where(eq(schema.eventJudges.id, judgeId));
    expect(row).toMatchObject({ userId: null, email: null });
    expect(await db.select().from(schema.judgingVotes).where(eq(schema.judgingVotes.judgeId, judgeId))).toHaveLength(1);

    loginAs(organizer);
    const results = unwrap(await getJudgingResults(eventId));
    expect(results.judges[0].label).toBe(`Deleted judge #${judgeId.slice(0, 8)}`);
    expect(results.judges[0].comparisons).toBe(1);
  });

  test('rows keyed by their email go too', async () => {
    const eventId = await makeEvent();
    const leaver = await makeUser('EmailRows');
    const bystander = await makeUser('EmailBystander');
    const judgeId = await rosterJudge(eventId, leaver, { link: false });
    const shouted = leaver.email.toUpperCase();
    const later = new Date(Date.now() + HOUR);
    await db.insert(schema.invite).values({ email: leaver.email, expiresAt: later });
    await db.insert(schema.magicLinkCooldown).values({ email: shouted });
    const tokens = await db
      .insert(schema.verification)
      .values([
        // Better Auth's magic-link (current and pre-1.7) and delete-account token shapes.
        {
          identifier: 'f',
          value: JSON.stringify({ type: 'magic-link', email: shouted, name: 'x' }),
          expiresAt: later,
        },
        {
          identifier: 'g',
          value: JSON.stringify({ type: 'magic-link', email: leaver.email }),
          expiresAt: later,
        },
        {
          identifier: 'a',
          value: JSON.stringify({ email: shouted, name: 'x' }),
          expiresAt: later,
        },
        {
          identifier: 'b',
          value: JSON.stringify({ email: leaver.email }),
          expiresAt: later,
        },
        { identifier: `delete-account-c`, value: leaver.id, expiresAt: later },
        // An address that merely starts with theirs, and someone else's link.
        {
          identifier: 'd',
          value: JSON.stringify({ email: `${leaver.email}.au` }),
          expiresAt: later,
        },
        {
          identifier: 'e',
          value: JSON.stringify({ email: bystander.email }),
          expiresAt: later,
        },
        {
          identifier: 'h',
          value: JSON.stringify({ type: 'magic-link', email: `${leaver.email}.au` }),
          expiresAt: later,
        },
      ])
      .returning({ identifier: schema.verification.identifier });

    await prepareUserDeletion(leaver.id);
    await db.delete(schema.user).where(eq(schema.user.id, leaver.id));

    const [judgeRow] = await db.select().from(schema.eventJudges).where(eq(schema.eventJudges.id, judgeId));
    expect(judgeRow).toMatchObject({ userId: null, email: null });
    expect(await db.select().from(schema.invite).where(eq(schema.invite.email, leaver.email))).toHaveLength(0);
    expect(
      await db.select().from(schema.magicLinkCooldown).where(eq(schema.magicLinkCooldown.email, shouted)),
    ).toHaveLength(0);
    const left = await db
      .select({ identifier: schema.verification.identifier })
      .from(schema.verification)
      .where(
        inArray(
          schema.verification.identifier,
          tokens.map((t) => t.identifier),
        ),
      );
    expect(left.map((t) => t.identifier).sort()).toEqual(['d', 'e', 'h']);
    await db.delete(schema.verification).where(inArray(schema.verification.identifier, ['d', 'e', 'h']));
  });

  test('deleting the event removes its judging data', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 2);
    const judge = await makeUser('EventDelete');
    const judgeId = await rosterJudge(eventId, judge);
    loginAs(judge);
    const first = expectKind(await Judging.getJudgeView(eventId), 'begin');
    await voteAll(eventId, expectKind(await begin(eventId, first.current.id), 'compare'), 'current');

    await db.delete(schema.events).where(eq(schema.events.id, eventId));
    expect(
      await db
        .select()
        .from(schema.eventJudges)
        .where(or(eq(schema.eventJudges.id, judgeId), eq(schema.eventJudges.eventId, eventId))),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.judgeState)
        .where(and(eq(schema.judgeState.judgeId, judgeId))),
    ).toHaveLength(0);
  });
});
