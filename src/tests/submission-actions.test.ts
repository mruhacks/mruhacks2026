/**
 * Tests for project submissions: src/app/dashboard/events/submission-actions.ts,
 * plus everything the feature reaches into — team-action guards at the
 * deadline, event-settings blocks, and what account deletion keeps.
 *
 * Object storage is mocked: these are about the actions' logic, not the bucket.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { and, eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  applicationVotes,
  auditLog,
  checkIns,
  eventRsvpWaves,
  events,
  permission,
  submissionEditors,
  submissions,
  teamMembers,
  teams,
  user,
  userPermission,
} from '@/db/schema';
import { insertParticipant } from '@/tests/participation-fixtures';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));
const putObject =
  vi.fn<(args: { key: string; contentType: string }) => Promise<void>>();
const deleteObject = vi.fn<(key: string) => Promise<void>>();
vi.mock('@/utils/object-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/object-storage')>()),
  putObject: (args: { key: string; contentType: string }) => putObject(args),
  deleteObject: (key: string) => deleteObject(key),
}));

import { getUser } from '@/utils/auth';
import {
  adminDeleteSubmission,
  createSubmission,
  deleteSubmission,
  getEventSubmission,
  getMySubmission,
  heartbeatSubmissionEditor,
  leaveSubmissionEditor,
  listEventSubmissions,
  saveSubmission,
  setSubmissionPublished,
  uploadSubmissionAttachment,
} from '@/app/dashboard/events/submission-actions';
import {
  getMyTeam,
  joinTeamByCode,
  leaveTeam,
  removeMember,
} from '@/app/dashboard/events/team-actions';
import { updateEventSettings } from '@/app/dashboard/admin/events/actions';
import { purgeUser } from '@/app/actions/users';
import { prepareUserDeletion } from '@/lib/account-deletion';
import { submissionAttachmentPrefix } from '@/utils/object-storage';
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

async function makeUser(label: string): Promise<TestUser> {
  const [u] = await db
    .insert(user)
    .values({
      name: `Sub ${label}`,
      email: `submission-test-${label.toLowerCase()}-${Date.now()}@example.com`,
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

/** An application event with teams, mid-way through its submission window. */
async function makeEvent(
  overrides: Partial<typeof events.$inferInsert> = {},
): Promise<string> {
  const now = Date.now();
  const [e] = await db
    .insert(events)
    .values({
      name: 'Submission Test Event',
      hasApplication: true,
      teamsEnabled: true,
      checkInEnabled: false,
      startsAt: new Date(now - HOUR),
      submissionsCloseAt: new Date(now + HOUR),
      endsAt: new Date(now + 2 * HOUR),
      ...overrides,
    })
    .returning({ id: events.id });
  created.events.push(e.id);
  return e.id;
}

/** Moves the deadline into the past (or back), keeping start < close < end. */
async function setDeadlinePassed(eventId: string, passed: boolean) {
  const now = Date.now();
  await db
    .update(events)
    .set(
      passed
        ? {
            startsAt: new Date(now - 2 * HOUR),
            submissionsCloseAt: new Date(now - HOUR),
          }
        : {
            startsAt: new Date(now - HOUR),
            submissionsCloseAt: new Date(now + HOUR),
          },
    )
    .where(eq(events.id, eventId));
}

function pngForm(): FormData {
  const formData = new FormData();
  formData.append(
    'file',
    new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }),
  );
  return formData;
}

async function currentSubmission(eventId: string) {
  const state = unwrap(await getMySubmission(eventId));
  return state.submission!;
}

function saveInput(
  submission: { updatedAt: Date },
  overrides: Record<string, unknown> = {},
) {
  return {
    title: 'Snack Overflow',
    markdown: 'We built a thing.',
    coverImageUrl: null,
    repoUrl: '',
    demoUrl: '',
    videoUrl: '',
    expectedUpdatedAt: submission.updatedAt.toISOString(),
    ...overrides,
  };
}

/** A and B share a team; C is denied; D is a solo participant. */
let eventId: string;
let userA: TestUser;
let userB: TestUser;
let userC: TestUser;
let userD: TestUser;
let admin: TestUser;
let teamCode: string;

beforeAll(async () => {
  eventId = await makeEvent();
  userA = await makeUser('A');
  userB = await makeUser('B');
  userC = await makeUser('C');
  userD = await makeUser('D');
  admin = await makeUser('Admin');

  await insertParticipant({
    eventId,
    userId: userA.id,
    status: 'pending_review',
  });
  await insertParticipant({ eventId, userId: userB.id, status: 'waitlisted' });
  await insertParticipant({ eventId, userId: userC.id, status: 'denied' });
  await insertParticipant({
    eventId,
    userId: userD.id,
    status: 'pending_review',
  });

  await grant(admin.id, [
    'submission:read:all',
    'submission:delete:all',
    'team:manage:all',
    'event:manage:all',
    'user:purge:all',
  ]);

  loginAs(userA);
  teamCode = unwrap(await getMyTeam(eventId)).code;
  loginAs(userB);
  unwrap(await joinTeamByCode(eventId, teamCode));
});

beforeEach(() => {
  putObject.mockReset().mockResolvedValue(undefined);
  deleteObject.mockReset().mockResolvedValue(undefined);
});

afterAll(async () => {
  for (const id of created.events) {
    await db.delete(events).where(eq(events.id, id));
  }
  for (const id of created.users) {
    await db.delete(user).where(eq(user.id, id));
  }
});

describe('eligibility and access', () => {
  test('an ineligible participant (denied) cannot see or start a project', async () => {
    loginAs(userC);
    expect((await getMySubmission(eventId)).success).toBe(false);
    expect((await createSubmission(eventId)).success).toBe(false);
  });

  test('with check-in enabled, only checked-in members qualify', async () => {
    const checkInEvent = await makeEvent({ checkInEnabled: true });
    await insertParticipant({
      eventId: checkInEvent,
      userId: userA.id,
      status: 'accepted',
    });
    loginAs(userA);
    expect((await getMySubmission(checkInEvent)).success).toBe(false);

    await db
      .insert(checkIns)
      .values({ userId: userA.id, eventId: checkInEvent });
    expect((await getMySubmission(checkInEvent)).success).toBe(true);
  });

  test('once an RSVP wave has gone out, only accepted participants qualify', async () => {
    const waveEvent = await makeEvent();
    await db.insert(eventRsvpWaves).values({
      eventId: waveEvent,
      wave: 1,
      respondBy: new Date(Date.now() + HOUR),
    });
    await insertParticipant({
      eventId: waveEvent,
      userId: userA.id,
      status: 'waitlisted',
    });
    await insertParticipant({
      eventId: waveEvent,
      userId: userB.id,
      status: 'accepted',
    });

    loginAs(userA);
    expect((await getMySubmission(waveEvent)).success).toBe(false);
    loginAs(userB);
    expect((await getMySubmission(waveEvent)).success).toBe(true);
  });

  test('an event missing a prerequisite takes no submissions', async () => {
    const noDeadline = await makeEvent({ submissionsCloseAt: null });
    await insertParticipant({
      eventId: noDeadline,
      userId: userA.id,
      status: 'pending_review',
    });
    loginAs(userA);
    expect((await getMySubmission(noDeadline)).success).toBe(false);
  });
});

describe('creating and saving', () => {
  test('starts one draft per team, shared by teammates', async () => {
    loginAs(userA);
    const first = unwrap(await createSubmission(eventId));
    loginAs(userB);
    const second = unwrap(await createSubmission(eventId));
    expect(second.id).toBe(first.id);

    const submission = await currentSubmission(eventId);
    expect(submission.published).toBe(false);
    expect(submission.lastEditedByName).toBe(userA.name);
  });

  test('a save from a stale copy is refused, then can be forced', async () => {
    loginAs(userA);
    const loadedByA = await currentSubmission(eventId);
    loginAs(userB);
    const loadedByB = await currentSubmission(eventId);

    const saved = unwrap(
      await saveSubmission(eventId, saveInput(loadedByB, { title: 'B wins' })),
    );
    expect(saved.status).toBe('saved');

    loginAs(userA);
    const stale = unwrap(
      await saveSubmission(eventId, saveInput(loadedByA, { title: 'A later' })),
    );
    expect(stale).toMatchObject({
      status: 'conflict',
      lastEditedByName: userB.name,
    });
    expect((await currentSubmission(eventId)).title).toBe('B wins');

    const forced = unwrap(
      await saveSubmission(
        eventId,
        saveInput(loadedByA, { title: 'A later', force: true }),
      ),
    );
    expect(forced.status).toBe('saved');
    expect((await currentSubmission(eventId)).title).toBe('A later');
  });

  test('validates links against their host lists', async () => {
    loginAs(userA);
    const submission = await currentSubmission(eventId);
    const result = await saveSubmission(
      eventId,
      saveInput(submission, { repoUrl: 'https://example.com/repo' }),
    );
    expect(result.success).toBe(false);
  });

  test('refuses a cover image that is not one of its own uploads', async () => {
    loginAs(userA);
    const submission = await currentSubmission(eventId);
    const foreign = `/api/assets/${submissionAttachmentPrefix(crypto.randomUUID())}${crypto.randomUUID()}.png`;
    const result = await saveSubmission(
      eventId,
      saveInput(submission, { coverImageUrl: foreign }),
    );
    expect(result.success).toBe(false);
  });

  test('caps images at 20 including the cover', async () => {
    loginAs(userA);
    const submission = await currentSubmission(eventId);
    const prefix = `/api/assets/${submissionAttachmentPrefix(submission.id)}`;
    const images = Array.from(
      { length: 20 },
      () => `![x](${prefix}${crypto.randomUUID()}.png)`,
    ).join('\n');
    const cover = `${prefix}${crypto.randomUUID()}.png`;

    const ok = await saveSubmission(
      eventId,
      saveInput(submission, { markdown: images }),
    );
    expect(ok.success).toBe(true);

    const tooMany = await saveSubmission(
      eventId,
      saveInput(await currentSubmission(eventId), {
        markdown: images,
        coverImageUrl: cover,
      }),
    );
    expect(tooMany.success).toBe(false);
  });

  test('uploads images under the submission prefix', async () => {
    loginAs(userA);
    const submission = await currentSubmission(eventId);
    const { url } = unwrap(
      await uploadSubmissionAttachment(eventId, pngForm()),
    );
    expect(url).toContain(submissionAttachmentPrefix(submission.id));
    expect(putObject).toHaveBeenCalledOnce();
  });
});

describe('publishing', () => {
  test('requires a repository link, and saving never changes the flag', async () => {
    loginAs(userA);
    expect((await setSubmissionPublished(eventId, true)).success).toBe(false);

    const submission = await currentSubmission(eventId);
    unwrap(
      await saveSubmission(
        eventId,
        saveInput(submission, { repoUrl: 'https://github.com/team/project' }),
      ),
    );
    unwrap(await setSubmissionPublished(eventId, true));
    const published = await currentSubmission(eventId);
    expect(published.published).toBe(true);

    // Publishing doesn't count as a content save for the staleness check.
    expect(published.updatedAt.getTime()).toBe(
      (await currentSubmission(eventId)).updatedAt.getTime(),
    );

    unwrap(
      await saveSubmission(
        eventId,
        saveInput(published, {
          repoUrl: 'https://github.com/team/project',
          title: 'Live edit',
        }),
      ),
    );
    expect(await currentSubmission(eventId)).toMatchObject({
      published: true,
      title: 'Live edit',
    });
  });

  test('a published project cannot drop its repository link', async () => {
    loginAs(userB);
    const submission = await currentSubmission(eventId);
    const result = await saveSubmission(eventId, saveInput(submission));
    expect(result.success).toBe(false);
  });
});

describe('editor presence', () => {
  test('reports teammates seen within the window, and clears on leave', async () => {
    loginAs(userA);
    expect(unwrap(await heartbeatSubmissionEditor(eventId))).toEqual([]);

    loginAs(userB);
    expect(unwrap(await heartbeatSubmissionEditor(eventId))).toEqual([
      { userId: userA.id, name: userA.name },
    ]);

    loginAs(userA);
    unwrap(await leaveSubmissionEditor(eventId));
    loginAs(userB);
    expect(unwrap(await heartbeatSubmissionEditor(eventId))).toEqual([]);
  });

  test('ignores a teammate whose heartbeat is stale', async () => {
    loginAs(userA);
    await heartbeatSubmissionEditor(eventId);
    await db
      .update(submissionEditors)
      .set({ lastSeenAt: new Date(Date.now() - 5 * 60 * 1000) })
      .where(eq(submissionEditors.userId, userA.id));
    loginAs(userB);
    expect(unwrap(await heartbeatSubmissionEditor(eventId))).toEqual([]);
  });
});

describe('the deadline', () => {
  test('freezes content, the flag, and deletion — and moving it later reopens', async () => {
    await setDeadlinePassed(eventId, true);
    loginAs(userA);
    const submission = await currentSubmission(eventId);
    expect(unwrap(await getMySubmission(eventId)).submissionWindow).toBe('closed');
    expect((await saveSubmission(eventId, saveInput(submission))).success).toBe(
      false,
    );
    expect((await setSubmissionPublished(eventId, false)).success).toBe(false);
    expect((await deleteSubmission(eventId)).success).toBe(false);

    await setDeadlinePassed(eventId, false);
    expect(unwrap(await getMySubmission(eventId)).submissionWindow).toBe('open');
  });

  test('locks self-service team changes, but not moderation', async () => {
    await setDeadlinePassed(eventId, true);
    try {
      loginAs(userD);
      const join = await joinTeamByCode(eventId, teamCode);
      expect(join.success).toBe(false);
      if (!join.success) expect(join.error).toMatch(/deadline/);

      loginAs(userB);
      expect((await leaveTeam(eventId)).success).toBe(false);

      // A is the team's organizer, but that's self-service.
      loginAs(userA);
      expect((await removeMember(eventId, userB.id)).success).toBe(false);
      expect(unwrap(await getMyTeam(eventId)).rosterLocked).toBe(true);
    } finally {
      await setDeadlinePassed(eventId, false);
    }
  });
});

describe('team membership interactions', () => {
  test('the last member of a team with a submission cannot join another team', async () => {
    loginAs(userD);
    unwrap(await createSubmission(eventId));
    const join = await joinTeamByCode(eventId, teamCode);
    expect(join.success).toBe(false);
    if (!join.success) expect(join.error).toMatch(/Delete it/);

    unwrap(await deleteSubmission(eventId));
    unwrap(await joinTeamByCode(eventId, teamCode));
    // Back out so later tests keep A+B as the only multi-member team.
    unwrap(await leaveTeam(eventId));
  });

  test('leaving a multi-member team leaves the submission with the team', async () => {
    loginAs(userA);
    const { teamId } = unwrap(await getMyTeam(eventId));
    loginAs(userD);
    unwrap(await joinTeamByCode(eventId, teamCode));
    unwrap(await leaveTeam(eventId));
    const [row] = await db
      .select({ teamId: submissions.teamId })
      .from(submissions)
      .where(eq(submissions.teamId, teamId));
    expect(row?.teamId).toBe(teamId);
  });
});

describe('admin access', () => {
  test('lists and reads every submission, drafts included', async () => {
    loginAs(admin);
    const rows = unwrap(await listEventSubmissions(eventId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.members.sort()).toEqual([userA.name, userB.name].sort());

    const detail = unwrap(await getEventSubmission(eventId, rows[0]!.id));
    expect(detail.title).toBe('Live edit');
  });

  test('participants without submission:read:all are refused', async () => {
    loginAs(userA);
    await expect(listEventSubmissions(eventId)).rejects.toThrow(
      /REDIRECT:\/forbidden/,
    );
  });
});

describe('event settings', () => {
  test('rejects a deadline outside the event', async () => {
    loginAs(admin);
    const result = await updateEventSettings(eventId, {
      submissionsCloseAt: new Date(Date.now() + 10 * HOUR).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  test('blocks turning off teams or check-in, or clearing the deadline, once a submission exists', async () => {
    loginAs(admin);
    expect(
      (await updateEventSettings(eventId, { teamsEnabled: false })).success,
    ).toBe(false);
    expect(
      (await updateEventSettings(eventId, { submissionsCloseAt: null }))
        .success,
    ).toBe(false);

    const checkInEvent = await makeEvent({ checkInEnabled: true });
    await insertParticipant({
      eventId: checkInEvent,
      userId: userD.id,
      status: 'accepted',
    });
    await db
      .insert(checkIns)
      .values({ userId: userD.id, eventId: checkInEvent });
    loginAs(userD);
    unwrap(await createSubmission(checkInEvent));
    loginAs(admin);
    expect(
      (await updateEventSettings(checkInEvent, { checkInEnabled: false }))
        .success,
    ).toBe(false);
  });
});

describe('deletion', () => {
  test('a team deletes its own project and the images it referenced', async () => {
    const solo = await makeEvent();
    await insertParticipant({
      eventId: solo,
      userId: userD.id,
      status: 'pending_review',
    });
    loginAs(userD);
    unwrap(await createSubmission(solo));
    const submission = await currentSubmission(solo);
    const own = `${submissionAttachmentPrefix(submission.id)}${crypto.randomUUID()}.png`;
    const cover = `${submissionAttachmentPrefix(submission.id)}${crypto.randomUUID()}.png`;
    unwrap(
      await saveSubmission(
        solo,
        saveInput(submission, {
          markdown: `![a](/api/assets/${own})`,
          coverImageUrl: `/api/assets/${cover}`,
        }),
      ),
    );

    unwrap(await deleteSubmission(solo));
    expect(deleteObject.mock.calls.map(([key]) => key).sort()).toEqual(
      [own, cover].sort(),
    );
    expect(unwrap(await getMySubmission(solo)).submission).toBeNull();
  });

  test('an admin can take one down at any time, audit-logged by id', async () => {
    await setDeadlinePassed(eventId, true);
    loginAs(admin);
    const [row] = unwrap(await listEventSubmissions(eventId));

    loginAs(userA);
    expect((await adminDeleteSubmission(eventId, row!.id)).success).toBe(false);

    loginAs(admin);
    unwrap(await adminDeleteSubmission(eventId, row!.id));
    const logs = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'submission.deleted'),
          eq(auditLog.targetId, row!.id),
        ),
      );
    expect(logs).toHaveLength(1);
    await setDeadlinePassed(eventId, false);
  });

  test('deleting the event cascades through teams and submissions', async () => {
    const doomed = await makeEvent();
    await insertParticipant({
      eventId: doomed,
      userId: userD.id,
      status: 'pending_review',
    });
    loginAs(userD);
    const { id } = unwrap(await createSubmission(doomed));
    await db.delete(events).where(eq(events.id, doomed));
    expect(
      await db.select().from(submissions).where(eq(submissions.id, id)),
    ).toHaveLength(0);
  });

  test('a team holding a submission cannot be dissolved directly', async () => {
    const guarded = await makeEvent();
    await insertParticipant({
      eventId: guarded,
      userId: userD.id,
      status: 'pending_review',
    });
    loginAs(userD);
    unwrap(await createSubmission(guarded));
    const { teamId } = unwrap(await getMyTeam(guarded));
    await expect(
      db.delete(teams).where(eq(teams.id, teamId)),
    ).rejects.toThrow();
  });
});

describe('account deletion', () => {
  test('keeps team content unattributed and hands the team on', async () => {
    const ev = await makeEvent();
    const organizer = await makeUser('Organizer');
    const teammate = await makeUser('Teammate');
    await insertParticipant({
      eventId: ev,
      userId: organizer.id,
      status: 'pending_review',
    });
    const teammateParticipant = await insertParticipant({
      eventId: ev,
      userId: teammate.id,
      status: 'pending_review',
    });

    loginAs(organizer);
    const { code, teamId } = unwrap(await getMyTeam(ev));
    loginAs(teammate);
    unwrap(await joinTeamByCode(ev, code));
    loginAs(organizer);
    unwrap(await createSubmission(ev));
    // The organizer also cast a review vote that must survive.
    await db.insert(applicationVotes).values({
      eventId: ev,
      participantId: teammateParticipant,
      voterId: organizer.id,
      approve: true,
    });

    await prepareUserDeletion(organizer.id);
    await db.delete(user).where(eq(user.id, organizer.id));

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(team?.organizerId).toBe(teammate.id);
    const [submission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.teamId, teamId));
    expect(submission?.lastEditedBy).toBeNull();

    const votes = await db
      .select()
      .from(applicationVotes)
      .where(eq(applicationVotes.participantId, teammateParticipant));
    expect(votes).toHaveLength(1);
    expect(votes[0]!.voterId).toBeNull();

    loginAs(teammate);
    expect((await getMySubmission(ev)).success).toBe(true);
    expect(
      unwrap(await getMySubmission(ev)).submission?.lastEditedByName,
    ).toBeNull();
  });

  test('a last member with a submission leaves an empty team behind; without one, the team goes', async () => {
    const ev = await makeEvent();
    const withProject = await makeUser('WithProject');
    const withoutProject = await makeUser('WithoutProject');
    for (const u of [withProject, withoutProject]) {
      await insertParticipant({
        eventId: ev,
        userId: u.id,
        status: 'pending_review',
      });
    }
    loginAs(withProject);
    const { teamId: keptTeam } = unwrap(await getMyTeam(ev));
    unwrap(await createSubmission(ev));
    loginAs(withoutProject);
    const { teamId: goneTeam } = unwrap(await getMyTeam(ev));

    for (const u of [withProject, withoutProject]) {
      await prepareUserDeletion(u.id);
      await db.delete(user).where(eq(user.id, u.id));
    }

    const [kept] = await db.select().from(teams).where(eq(teams.id, keptTeam));
    expect(kept?.organizerId).toBeNull();
    expect(
      await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, keptTeam)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(submissions)
        .where(eq(submissions.teamId, keptTeam)),
    ).toHaveLength(1);
    expect(
      await db.select().from(teams).where(eq(teams.id, goneTeam)),
    ).toHaveLength(0);
  });

  test('purgeUser needs user:purge:all and logs only the user id', async () => {
    const target = await makeUser('Purged');
    loginAs(userA);
    expect((await purgeUser(target.id)).success).toBe(false);

    loginAs(admin);
    unwrap(await purgeUser(target.id));
    expect(
      await db.select().from(user).where(eq(user.id, target.id)),
    ).toHaveLength(0);
    const [log] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'user.purged'),
          eq(auditLog.targetId, target.id),
        ),
      );
    expect(log).toBeDefined();
    expect(JSON.stringify(log!.metadata ?? {})).not.toContain(target.email);
  });
});
