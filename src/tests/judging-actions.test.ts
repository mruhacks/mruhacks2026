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
import {
  eventJudges,
  eventParticipants,
  events,
  judgeNotes,
  judgeState,
  judgingCriteria,
  judgingVotes,
  permission,
  submissionScores,
  submissions,
  teams,
  user,
  userPermission,
} from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));
const sendJudgeInvite =
  vi.fn<(args: { email: string; eventName: string }) => Promise<void>>();
vi.mock('@/lib/judging/judge-invite', () => ({
  sendJudgeInvite: (args: { email: string; eventName: string }) =>
    sendJudgeInvite(args),
}));

import { getUser } from '@/utils/auth';
import {
  addEventJudge,
  createJudgingCriterion,
  deleteJudgingCriterion,
  getJudgingAdmin,
  getJudgingResults,
  moveJudgingCriterion,
  removeEventJudge,
  resendJudgeInvite,
  setEventJudgeDisabled,
  setSubmissionDeactivated,
  setSubmissionFinalist,
  setSubmissionPlacement,
  updateJudgingCriterion,
} from '@/app/dashboard/admin/events/judging-actions';
import {
  beginJudging,
  getJudgeView,
  saveJudgeNote,
  skipJudgeProject,
  submitJudgeVote,
  type JudgeView,
} from '@/app/dashboard/events/judge-actions';
import { registerForEvent } from '@/app/register/actions';
import { prepareUserDeletion } from '@/lib/account-deletion';
import { getTableNumbers, linkJudgeRosterRows } from '@/lib/judging/server';
import { unwrap } from './unwrap';

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

const HOUR = 60 * 60 * 1000;
const created: { users: string[]; events: string[] } = {
  users: [],
  events: [],
};
let counter = 0;

async function makeUser(label: string): Promise<TestUser> {
  counter += 1;
  const [u] = await db
    .insert(user)
    .values({
      name: `Judging ${label}`,
      email: `judging-test-${label.toLowerCase()}-${counter}-${Date.now()}@example.com`,
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

async function grant(userId: string, slugs: string[]) {
  for (const slug of slugs) {
    await db
      .insert(permission)
      .values({ slug, description: 'test permission' })
      .onConflictDoNothing();
    const [p] = await db
      .select({ id: permission.id })
      .from(permission)
      .where(eq(permission.slug, slug));
    await db
      .insert(userPermission)
      .values({ userId, permissionId: p!.id })
      .onConflictDoNothing();
  }
}

/** An event in progress: judging open, submissions still open. */
async function makeEvent(
  overrides: Partial<typeof events.$inferInsert> = {},
): Promise<string> {
  const now = Date.now();
  const [e] = await db
    .insert(events)
    .values({
      name: 'Judging Test Event',
      hasApplication: true,
      teamsEnabled: true,
      startsAt: new Date(now - HOUR),
      submissionsCloseAt: new Date(now + HOUR),
      endsAt: new Date(now + 2 * HOUR),
      ...overrides,
    })
    .returning({ id: events.id });
  created.events.push(e.id);
  return e.id;
}

/** `n` published projects, created a second apart so table numbers are 1..n. */
async function makeProjects(
  eventId: string,
  n: number,
  { published = true } = {},
): Promise<string[]> {
  const ids: string[] = [];
  const base = Date.now() - 10 * HOUR;
  for (let i = 0; i < n; i++) {
    const [team] = await db
      .insert(teams)
      .values({ eventId, code: `J${String(counter++).padStart(7, '0')}` })
      .returning({ id: teams.id });
    const [s] = await db
      .insert(submissions)
      .values({
        eventId,
        teamId: team.id,
        title: `Project ${i + 1}`,
        published,
        publishedAt: published ? new Date() : null,
        createdAt: new Date(base + (ids.length + 1) * 1000),
      })
      .returning({ id: submissions.id });
    ids.push(s.id);
  }
  return ids;
}

async function addCriteria(eventId: string, names: string[]) {
  for (const name of names) {
    unwrap(
      await createJudgingCriterion(eventId, {
        name,
        description: `${name}, briefly`,
        weight: 1,
      }),
    );
  }
  return db
    .select()
    .from(judgingCriteria)
    .where(eq(judgingCriteria.eventId, eventId))
    .orderBy(judgingCriteria.position);
}

async function rosterJudge(
  eventId: string,
  judge: TestUser,
  { link = true } = {},
): Promise<string> {
  const [row] = await db
    .insert(eventJudges)
    .values({
      eventId,
      email: judge.email.toLowerCase(),
      userId: link ? judge.id : null,
    })
    .returning({ id: eventJudges.id });
  return row.id;
}

function expectKind<K extends JudgeView['kind']>(
  view: JudgeView,
  kind: K,
): Extract<JudgeView, { kind: K }> {
  expect(view.kind).toBe(kind);
  return view as Extract<JudgeView, { kind: K }>;
}

async function voteAll(
  eventId: string,
  view: Extract<JudgeView, { kind: 'compare' }>,
  side: 'previous' | 'current',
) {
  return unwrap(
    await submitJudgeVote(eventId, {
      previousId: view.previous.id,
      currentId: view.current.id,
      winners: Object.fromEntries(view.criteria.map((c) => [c.id, side])),
    }),
  );
}

let organizer: TestUser;

beforeEach(async () => {
  sendJudgeInvite.mockReset();
  sendJudgeInvite.mockResolvedValue();
  if (!organizer) {
    organizer = await makeUser('Organizer');
    await grant(organizer.id, [
      'judging:manage:all',
      'judging:results:all',
      'judging:award:all',
    ]);
  }
});

afterAll(async () => {
  if (created.events.length > 0) {
    await db.delete(events).where(inArray(events.id, created.events));
  }
  if (created.users.length > 0) {
    await db.delete(user).where(inArray(user.id, created.users));
  }
});

describe('criteria', () => {
  test('organizers add, edit, reorder and remove criteria', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const [design, tech, pitch] = await addCriteria(eventId, [
      'Design',
      'Tech',
      'Pitch',
    ]);
    expect([design.position, tech.position, pitch.position]).toEqual([0, 1, 2]);

    unwrap(await moveJudgingCriterion(eventId, pitch.id, 'up'));
    unwrap(await deleteJudgingCriterion(eventId, design.id));
    unwrap(
      await updateJudgingCriterion(eventId, tech.id, {
        name: 'Technical depth',
        description: 'How hard was it?',
        weight: 2,
      }),
    );

    const data = unwrap(await getJudgingAdmin(eventId));
    expect(data.criteria.map((c) => c.name)).toEqual([
      'Pitch',
      'Technical depth',
    ]);
    expect(data.criteria[1].weight).toBe(2);
    expect(data.structureLocked).toBe(false);
  });

  test('rejects invalid input with a message for the form', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const blank = await createJudgingCriterion(eventId, {
      name: '  ',
      description: '',
      weight: 1,
    });
    expect(blank).toEqual({
      success: false,
      error: 'Give the criterion a name.',
    });
    const multiline = await createJudgingCriterion(eventId, {
      name: 'Design',
      description: 'one\ntwo',
      weight: 1,
    });
    expect(multiline.success).toBe(false);
    const negative = await createJudgingCriterion(eventId, {
      name: 'Design',
      description: '',
      weight: -1,
    });
    expect(negative.success).toBe(false);
  });

  test('requires judging:manage:all', async () => {
    const eventId = await makeEvent();
    const outsider = await makeUser('Outsider');
    await grant(outsider.id, ['judging:results:all']);
    loginAs(outsider);
    const result = await createJudgingCriterion(eventId, {
      name: 'Design',
      description: '',
      weight: 1,
    });
    expect(result.success).toBe(false);
    expect((await getJudgingAdmin(eventId)).success).toBe(false);
  });

  test('after the first vote only name, description and weight can change', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const [design] = await addCriteria(eventId, ['Design', 'Tech']);
    await makeProjects(eventId, 2);
    const judge = await makeUser('LockJudge');
    await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await getJudgeView(eventId), 'begin');
    const compare = expectKind(
      unwrap(await beginJudging(eventId, first.current.id)),
      'compare',
    );
    await voteAll(eventId, compare, 'current');

    loginAs(organizer);
    expect(unwrap(await getJudgingAdmin(eventId)).structureLocked).toBe(true);
    for (const result of [
      await createJudgingCriterion(eventId, {
        name: 'More',
        description: '',
        weight: 1,
      }),
      await deleteJudgingCriterion(eventId, design.id),
      await moveJudgingCriterion(eventId, design.id, 'down'),
    ]) {
      expect(result.success).toBe(false);
    }
    unwrap(
      await updateJudgingCriterion(eventId, design.id, {
        name: 'Design & UX',
        description: 'Renamed',
        weight: 3,
      }),
    );
  });
});

describe('roster', () => {
  test('adding a judge stores the lowercased email and emails them', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const result = unwrap(
      await addEventJudge(eventId, '  New.Judge@Example.com '),
    );
    expect(result.emailSent).toBe(true);
    expect(sendJudgeInvite).toHaveBeenCalledWith({
      email: 'new.judge@example.com',
      eventName: 'Judging Test Event',
    });
    const [row] = await db
      .select()
      .from(eventJudges)
      .where(eq(eventJudges.eventId, eventId));
    expect(row.email).toBe('new.judge@example.com');
    expect(row.userId).toBeNull();

    const duplicate = await addEventJudge(eventId, 'new.judge@example.com');
    expect(duplicate).toEqual({
      success: false,
      error: 'That email is already on the roster.',
    });
    expect((await addEventJudge(eventId, 'not-an-email')).success).toBe(false);
  });

  test('an address that already has an account is linked straight away', async () => {
    const eventId = await makeEvent();
    const existing = await makeUser('Existing');
    loginAs(organizer);
    unwrap(await addEventJudge(eventId, existing.email.toUpperCase()));
    const [row] = await db
      .select()
      .from(eventJudges)
      .where(eq(eventJudges.eventId, eventId));
    expect(row.userId).toBe(existing.id);
  });

  test('a failed invite email still adds the judge', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    sendJudgeInvite.mockRejectedValueOnce(new Error('smtp down'));
    const result = unwrap(await addEventJudge(eventId, 'flaky@example.com'));
    expect(result.emailSent).toBe(false);
    const data = unwrap(await getJudgingAdmin(eventId));
    expect(data.judges).toHaveLength(1);
    unwrap(await resendJudgeInvite(eventId, data.judges[0].id));
    expect(sendJudgeInvite).toHaveBeenCalledTimes(2);
  });

  test('sign-in links a roster row added by email', async () => {
    const eventId = await makeEvent();
    const later = await makeUser('Later');
    await rosterJudge(eventId, later, { link: false });
    await linkJudgeRosterRows(later.id);
    const [row] = await db
      .select()
      .from(eventJudges)
      .where(eq(eventJudges.eventId, eventId));
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
    const first = expectKind(await getJudgeView(eventId), 'begin');
    await voteAll(
      eventId,
      expectKind(
        unwrap(await beginJudging(eventId, first.current.id)),
        'compare',
      ),
      'previous',
    );

    loginAs(organizer);
    expect((await removeEventJudge(eventId, voterId)).success).toBe(false);
    unwrap(await removeEventJudge(eventId, idleId));
    const remaining = unwrap(await getJudgingAdmin(eventId)).judges;
    expect(remaining.map((j) => j.id)).toEqual([voterId]);
    expect(remaining[0].comparisons).toBe(1);
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
      .update(eventJudges)
      .set({ userId: judge.id, disabledAt: new Date() })
      .where(eq(eventJudges.id, judgeId));
    expect((await registerForEvent(eventId)).success).toBe(false);
    expect(
      await db
        .select()
        .from(eventParticipants)
        .where(eq(eventParticipants.eventId, eventId)),
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
    expect((await getJudgeView(eventId)).kind).toBe('not_judge');
  });

  test('an unlinked roster row matches the signed-in email', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 1);
    const judge = await makeUser('Unlinked');
    await rosterJudge(eventId, judge, { link: false });
    loginAs(judge);
    expect((await getJudgeView(eventId)).kind).toBe('begin');
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
    expect((await getJudgeView(future)).kind).toBe('not_open');
    expect((await getJudgeView(past)).kind).toBe('closed');
  });

  test('no dispatch until the event has a criterion', async () => {
    const eventId = await makeEvent();
    await makeProjects(eventId, 2);
    const judge = await makeUser('NoCriteria');
    await rosterJudge(eventId, judge);
    loginAs(judge);
    expect((await getJudgeView(eventId)).kind).toBe('no_criteria');
  });

  test('begin, then compare on every criterion, updating votes and scores', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    const criteria = await addCriteria(eventId, ['Design', 'Tech']);
    const projects = await makeProjects(eventId, 3);
    const judge = await makeUser('Walker');
    const judgeId = await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await getJudgeView(eventId), 'begin');
    expect(projects).toContain(first.current.id);
    expect(first.current.tableNumber).toBe(
      projects.indexOf(first.current.id) + 1,
    );
    // Reloading keeps the same assignment.
    expect(expectKind(await getJudgeView(eventId), 'begin').current.id).toBe(
      first.current.id,
    );

    const compare = expectKind(
      unwrap(await beginJudging(eventId, first.current.id)),
      'compare',
    );
    expect(compare.previous.id).toBe(first.current.id);
    expect(compare.current.id).not.toBe(first.current.id);
    expect(compare.criteria.map((c) => c.name)).toEqual(['Design', 'Tech']);
    expect(compare.criteria[0].description).toBe('Design, briefly');

    // Missing a criterion is refused.
    const partial = await submitJudgeVote(eventId, {
      previousId: compare.previous.id,
      currentId: compare.current.id,
      winners: { [criteria[0].id]: 'current' },
    });
    expect(partial.success).toBe(false);

    const next = await voteAll(eventId, compare, 'current');
    const votes = await db
      .select()
      .from(judgingVotes)
      .where(eq(judgingVotes.judgeId, judgeId));
    expect(votes).toHaveLength(2);
    expect(
      votes.every((v) => v.winnerSubmissionId === compare.current.id),
    ).toBe(true);
    const scores = await db
      .select()
      .from(submissionScores)
      .where(eq(submissionScores.submissionId, compare.current.id));
    expect(scores).toHaveLength(2);
    expect(scores.every((s) => s.mu > 0)).toBe(true);

    // The third project is compared against the one just voted on.
    const third = expectKind(next, 'compare');
    expect(third.previous.id).toBe(compare.current.id);
    const remaining = projects.filter(
      (id) => id !== first.current.id && id !== compare.current.id,
    );
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
    const first = expectKind(await getJudgeView(eventId), 'begin');
    const compare = expectKind(
      unwrap(await beginJudging(eventId, first.current.id)),
      'compare',
    );
    await Promise.all([
      voteAll(eventId, compare, 'current'),
      voteAll(eventId, compare, 'current'),
    ]);
    const votes = await db
      .select()
      .from(judgingVotes)
      .where(eq(judgingVotes.judgeId, judgeId));
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
    expectKind(await getJudgeView(eventId), 'begin');
    const afterNotHere = unwrap(
      await skipJudgeProject(eventId, { currentId: only, reason: 'not_here' }),
    );
    expect(afterNotHere.kind).toBe('waiting');

    // Ten minutes on, the team may be back.
    await db.execute(
      `UPDATE judge_skips SET created_at = now() - interval '11 minutes' WHERE judge_id = '${judgeId}'`,
    );
    expect(expectKind(await getJudgeView(eventId), 'begin').current.id).toBe(
      only,
    );

    const afterConflict = unwrap(
      await skipJudgeProject(eventId, { currentId: only, reason: 'conflict' }),
    );
    expect(afterConflict.kind).toBe('waiting');
    await db.execute(
      `UPDATE judge_skips SET created_at = now() - interval '1 day' WHERE judge_id = '${judgeId}'`,
    );
    expect((await getJudgeView(eventId)).kind).toBe('waiting');
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
    const viewA = expectKind(await getJudgeView(eventId), 'begin');
    loginAs(b);
    const viewB = expectKind(await getJudgeView(eventId), 'begin');
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
    const first = expectKind(await getJudgeView(eventId), 'begin');
    expect(first.current.id).toBe(kept);
    expect(unwrap(await beginJudging(eventId, kept)).kind).toBe('waiting');
  });

  test('a project deactivated mid-visit is skipped without recording votes', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 3);
    const judge = await makeUser('MidVisit');
    const judgeId = await rosterJudge(eventId, judge);

    loginAs(judge);
    const first = expectKind(await getJudgeView(eventId), 'begin');
    const compare = expectKind(
      unwrap(await beginJudging(eventId, first.current.id)),
      'compare',
    );
    loginAs(organizer);
    unwrap(await setSubmissionDeactivated(eventId, compare.current.id, true));
    loginAs(judge);
    await voteAll(eventId, compare, 'current');
    expect(
      await db
        .select()
        .from(judgingVotes)
        .where(eq(judgingVotes.judgeId, judgeId)),
    ).toHaveLength(0);
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
    expect((await getJudgeView(eventId)).kind).toBe('disabled');
  });

  test('notes are private to the judge and go with their account', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    const [project] = await makeProjects(eventId, 1);
    const judge = await makeUser('Notes');
    const other = await makeUser('OtherNotes');
    await rosterJudge(eventId, judge);
    await rosterJudge(eventId, other);

    loginAs(judge);
    unwrap(
      await saveJudgeNote(eventId, {
        submissionId: project,
        body: 'Great demo',
      }),
    );
    expect(expectKind(await getJudgeView(eventId), 'begin').current.note).toBe(
      'Great demo',
    );
    const tooLong = await saveJudgeNote(eventId, {
      submissionId: project,
      body: 'x'.repeat(5001),
    });
    expect(tooLong.success).toBe(false);

    loginAs(other);
    // The other judge is sent elsewhere or waits; either way not this note.
    const otherView = await getJudgeView(eventId);
    if (otherView.kind === 'begin') expect(otherView.current.note).toBe('');

    const stranger = await makeUser('NoteStranger');
    loginAs(stranger);
    expect(
      (await saveJudgeNote(eventId, { submissionId: project, body: 'x' }))
        .success,
    ).toBe(false);

    await db.delete(user).where(eq(user.id, judge.id));
    expect(
      await db.select().from(judgeNotes).where(eq(judgeNotes.userId, judge.id)),
    ).toHaveLength(0);
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
    let view = await getJudgeView(eventId);
    view = unwrap(
      await beginJudging(eventId, expectKind(view, 'begin').current.id),
    );
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
    expect(results.byCriterion.map((c) => c.id)).toEqual(
      criteria.map((c) => c.id),
    );
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
      await updateJudgingCriterion(eventId, criteria[0].id, {
        name: criteria[0].name,
        description: criteria[0].description,
        weight: 5,
      }),
    );
    const after = unwrap(await getJudgingResults(eventId));
    expect(after.byCriterion).toEqual(
      before.byCriterion.map((table) =>
        table.id === criteria[0].id ? { ...table, weight: 5 } : table,
      ),
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
    expect(results.overall.map((row) => row.tableNumber)).toEqual([1, 2, 3]);
  });

  test('results require a results or award permission', async () => {
    const { eventId } = await runExpo();
    const manager = await makeUser('ManagerOnly');
    await grant(manager.id, ['judging:manage:all']);
    loginAs(manager);
    expect((await getJudgingResults(eventId)).success).toBe(false);
  });

  test('finalists and unique placements', async () => {
    const { eventId, projects } = await runExpo();
    loginAs(organizer);
    unwrap(await setSubmissionFinalist(eventId, projects[0], true));
    unwrap(await setSubmissionPlacement(eventId, projects[0], 1));
    const taken = await setSubmissionPlacement(eventId, projects[1], 1);
    expect(taken).toEqual({
      success: false,
      error: '“Project 1” already holds place 1.',
    });
    expect(
      (await setSubmissionPlacement(eventId, projects[1], 0)).success,
    ).toBe(false);
    unwrap(await setSubmissionPlacement(eventId, projects[1], 2));
    unwrap(await setSubmissionPlacement(eventId, projects[0], null));
    unwrap(await setSubmissionPlacement(eventId, projects[1], 1));

    const results = unwrap(await getJudgingResults(eventId));
    const byId = new Map(results.overall.map((row) => [row.id, row]));
    expect(byId.get(projects[0])).toMatchObject({
      finalist: true,
      placement: null,
    });
    expect(byId.get(projects[1])?.placement).toBe(1);

    const resultsOnly = await makeUser('ResultsOnly');
    await grant(resultsOnly.id, ['judging:results:all']);
    loginAs(resultsOnly);
    expect(
      (await setSubmissionFinalist(eventId, projects[2], true)).success,
    ).toBe(false);
  });
});

describe('table numbers', () => {
  test('are 1-based by creation order, drafts included', async () => {
    const eventId = await makeEvent();
    const [a, draft, b] = [
      ...(await makeProjects(eventId, 1)),
      ...(await makeProjects(eventId, 1, { published: false })),
      ...(await makeProjects(eventId, 1)),
    ];
    const tables = await getTableNumbers(eventId);
    expect([tables.get(a), tables.get(draft), tables.get(b)]).toEqual([
      1, 2, 3,
    ]);
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
    const first = expectKind(await getJudgeView(eventId), 'begin');
    await voteAll(
      eventId,
      expectKind(
        unwrap(await beginJudging(eventId, first.current.id)),
        'compare',
      ),
      'current',
    );

    await prepareUserDeletion(judge.id);
    await db.delete(user).where(eq(user.id, judge.id));

    const [row] = await db
      .select()
      .from(eventJudges)
      .where(eq(eventJudges.id, judgeId));
    expect(row).toMatchObject({ userId: null, email: null });
    expect(
      await db
        .select()
        .from(judgingVotes)
        .where(eq(judgingVotes.judgeId, judgeId)),
    ).toHaveLength(1);

    loginAs(organizer);
    const results = unwrap(await getJudgingResults(eventId));
    expect(results.judges[0].label).toBe(
      `Deleted judge #${judgeId.slice(0, 8)}`,
    );
    expect(results.judges[0].comparisons).toBe(1);
  });

  test('deleting the event removes its judging data', async () => {
    const eventId = await makeEvent();
    loginAs(organizer);
    await addCriteria(eventId, ['Design']);
    await makeProjects(eventId, 2);
    const judge = await makeUser('EventDelete');
    const judgeId = await rosterJudge(eventId, judge);
    loginAs(judge);
    const first = expectKind(await getJudgeView(eventId), 'begin');
    await voteAll(
      eventId,
      expectKind(
        unwrap(await beginJudging(eventId, first.current.id)),
        'compare',
      ),
      'current',
    );

    await db.delete(events).where(eq(events.id, eventId));
    expect(
      await db
        .select()
        .from(eventJudges)
        .where(
          or(eq(eventJudges.id, judgeId), eq(eventJudges.eventId, eventId)),
        ),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(judgeState)
        .where(and(eq(judgeState.judgeId, judgeId))),
    ).toHaveLength(0);
  });
});
