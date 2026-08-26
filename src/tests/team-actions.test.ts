import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import {
  user,
  events,
  eventAttendees,
  teams,
  permission,
  userPermission,
  auditLog,
} from '@/db/schema';
import {
  getMyTeam,
  joinTeamByCode,
  leaveTeam,
  removeMember,
} from '@/app/dashboard/events/team-actions';
import { getFormedTeamsForEvent } from '@/app/dashboard/admin/events/actions';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import { getUser } from '@/utils/auth';

type TestUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

function loginAs(u: TestUser) {
  vi.mocked(getUser).mockResolvedValue(u as never);
}

let eventId: string;
let userA: TestUser;
let userB: TestUser;
let userC: TestUser;
let userD: TestUser;
let adminUser: TestUser;

async function makeUser(label: string): Promise<TestUser> {
  const [u] = await db
    .insert(user)
    .values({
      name: `Team Test ${label}`,
      email: `team-test-${label.toLowerCase()}@example.com`,
      emailVerified: true,
    })
    .returning({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    });
  return u;
}

beforeAll(async () => {
  const [e] = await db
    .insert(events)
    .values({
      name: 'Team Test Event',
      hasApplication: false,
      teamsEnabled: true,
      maxTeamSize: 3,
    })
    .returning({ id: events.id });
  eventId = e.id;

  userA = await makeUser('A');
  userB = await makeUser('B');
  userC = await makeUser('C');
  userD = await makeUser('D');
  adminUser = await makeUser('Admin');

  await db
    .insert(eventAttendees)
    .values([
      { eventId, userId: userA.id },
      { eventId, userId: userB.id },
      { eventId, userId: userC.id },
      { eventId, userId: userD.id },
    ]);

  const perms = await db
    .insert(permission)
    .values([
      { slug: 'team:manage:all', description: 'test permission' },
      { slug: 'team:read:all', description: 'test permission' },
    ])
    .returning({ id: permission.id });
  await db
    .insert(userPermission)
    .values(perms.map((p) => ({ userId: adminUser.id, permissionId: p.id })));
});

afterAll(async () => {
  await db.delete(events).where(eq(events.id, eventId));
  for (const u of [userA, userB, userC, userD, adminUser]) {
    await db.delete(user).where(eq(user.id, u.id));
  }
});

describe('getMyTeam', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await getMyTeam(eventId);
    expect(result.success).toBe(false);
  });

  test('fails for a non-participant', async () => {
    const [nonParticipant] = await db
      .insert(user)
      .values({
        name: 'Non Participant',
        email: 'team-test-nonparticipant@example.com',
        emailVerified: true,
      })
      .returning({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
      });
    loginAs(nonParticipant);
    const result = await getMyTeam(eventId);
    expect(result.success).toBe(false);
    await db.delete(user).where(eq(user.id, nonParticipant.id));
  });

  test('lazily creates a personal team-of-one on first access', async () => {
    loginAs(userA);
    const result = await getMyTeam(eventId);
    expect(result.success).toBe(true);
    if (!result.success || !result.data) throw new Error('expected data');
    expect(result.data.members).toHaveLength(1);
    expect(result.data.organizerId).toBe(userA.id);
    expect(result.data.code).toHaveLength(8);
  });
});

describe('joinTeamByCode', () => {
  test('fails with an invalid code', async () => {
    loginAs(userB);
    const result = await joinTeamByCode(eventId, 'ZZZZZZZZ');
    expect(result.success).toBe(false);
  });

  test('re-entering your own code is a no-op', async () => {
    loginAs(userB);
    const myTeam = await getMyTeam(eventId);
    if (!myTeam.success || !myTeam.data) throw new Error('expected data');
    const result = await joinTeamByCode(eventId, myTeam.data.code);
    expect(result.success).toBe(true);
  });

  test('B joins A: A stays organizer, B old solo team dissolves', async () => {
    loginAs(userA);
    const aTeam = await getMyTeam(eventId);
    if (!aTeam.success || !aTeam.data) throw new Error('expected data');
    const aCode = aTeam.data.code;
    const aTeamId = aTeam.data.teamId;

    loginAs(userB);
    const bTeamBefore = await getMyTeam(eventId);
    if (!bTeamBefore.success || !bTeamBefore.data) throw new Error('expected data');
    const bOldTeamId = bTeamBefore.data.teamId;

    const joinResult = await joinTeamByCode(eventId, aCode);
    expect(joinResult.success).toBe(true);

    const rosterAfter = await getMyTeam(eventId);
    if (!rosterAfter.success || !rosterAfter.data) throw new Error('expected data');
    expect(rosterAfter.data.teamId).toBe(aTeamId);
    expect(rosterAfter.data.organizerId).toBe(userA.id);
    expect(rosterAfter.data.members.map((m) => m.userId).sort()).toEqual(
      [userA.id, userB.id].sort(),
    );

    const dissolvedTeam = await db
      .select()
      .from(teams)
      .where(eq(teams.id, bOldTeamId));
    expect(dissolvedTeam).toHaveLength(0);
  });

  test('rejects joining a team already at its configured max size', async () => {
    loginAs(userA);
    const aTeam = await getMyTeam(eventId);
    if (!aTeam.success || !aTeam.data) throw new Error('expected data');
    const aCode = aTeam.data.code;

    loginAs(userC);
    const joinC = await joinTeamByCode(eventId, aCode);
    expect(joinC.success).toBe(true); // team now has 3 (A, B, C) = maxTeamSize

    loginAs(userD);
    const joinD = await joinTeamByCode(eventId, aCode);
    expect(joinD.success).toBe(false);
    if (!joinD.success) expect(joinD.error).toMatch(/full/i);
  });
});

describe('leaveTeam', () => {
  test('leaving a solo team is a no-op', async () => {
    loginAs(userD);
    const result = await leaveTeam(eventId);
    expect(result.success).toBe(true);
  });

  test('organizer leaving reassigns organizer to earliest-joined remaining member', async () => {
    // Team is currently A (organizer), B, C (joined in that order).
    loginAs(userA);
    const result = await leaveTeam(eventId);
    expect(result.success).toBe(true);

    loginAs(userB);
    const bTeam = await getMyTeam(eventId);
    if (!bTeam.success || !bTeam.data) throw new Error('expected data');
    expect(bTeam.data.organizerId).toBe(userB.id);
    expect(bTeam.data.members.map((m) => m.userId).sort()).toEqual(
      [userB.id, userC.id].sort(),
    );

    // A reverted to a fresh personal team-of-one.
    loginAs(userA);
    const aTeamAfter = await getMyTeam(eventId);
    if (!aTeamAfter.success || !aTeamAfter.data) throw new Error('expected data');
    expect(aTeamAfter.data.members).toHaveLength(1);
    expect(aTeamAfter.data.organizerId).toBe(userA.id);
  });
});

describe('removeMember', () => {
  test('organizer can remove a member; removed member gets a fresh team', async () => {
    // Team is currently B (organizer), C.
    loginAs(userB);
    const result = await removeMember(eventId, userC.id);
    expect(result.success).toBe(true);

    loginAs(userC);
    const cTeam = await getMyTeam(eventId);
    if (!cTeam.success || !cTeam.data) throw new Error('expected data');
    expect(cTeam.data.members).toHaveLength(1);
    expect(cTeam.data.organizerId).toBe(userC.id);
  });

  test('a non-organizer without team:manage:all cannot remove a member', async () => {
    loginAs(userA);
    const result = await removeMember(eventId, userB.id);
    expect(result.success).toBe(false);
  });

  test('cannot remove yourself via removeMember', async () => {
    loginAs(userB);
    const result = await removeMember(eventId, userB.id);
    expect(result.success).toBe(false);
  });

  test('an admin with team:manage:all can remove any member and it is audit-logged', async () => {
    loginAs(adminUser);
    const result = await removeMember(eventId, userB.id);
    expect(result.success).toBe(true);

    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'team.member.removed'));
    expect(logs.some((l) => l.targetId === userB.id)).toBe(true);
  });
});

describe('getFormedTeamsForEvent', () => {
  test('only lists teams with more than one member', async () => {
    // Re-group A and C into one team so there's exactly one formed team.
    loginAs(userA);
    const aTeam = await getMyTeam(eventId);
    if (!aTeam.success || !aTeam.data) throw new Error('expected data');

    loginAs(userC);
    const joinResult = await joinTeamByCode(eventId, aTeam.data.code);
    expect(joinResult.success).toBe(true);

    loginAs(adminUser);
    const result = await getFormedTeamsForEvent(eventId);
    expect(result.success).toBe(true);
    if (!result.success || !result.data) throw new Error('expected data');

    expect(result.data.every((t) => t.memberCount > 1)).toBe(true);
    const formedTeam = result.data.find((t) =>
      t.members.some((m) => m.userId === userA.id),
    );
    expect(formedTeam?.members.map((m) => m.userId).sort()).toEqual(
      [userA.id, userC.id].sort(),
    );
  });
});
