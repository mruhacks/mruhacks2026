import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import {
  checkIns,
  dietaryRestrictions,
  eventParticipants,
  events,
  eventTypes,
  genders,
  participationStatuses,
  permission,
  user,
  userDietaryRestrictions,
  userPermission,
  userProfiles,
} from '@/db/schema';
import { db } from '@/utils/db';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import { getUser } from '@/utils/auth';
import { getDietaryReport } from '@/app/dashboard/admin/events/dietary-actions';
import { MEAL_EVENT_TYPE } from '@/types/lookups';

const NOW = Date.now();
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000);
const hoursAhead = (hours: number) => new Date(NOW + hours * 3_600_000);

const doorAt = hoursAgo(5);
const absentDoorAt = hoursAgo(4.9);
const lunchAt = hoursAgo(1.8);
const keynoteAt = hoursAgo(0.8);

let eventId: string;
let lunchId: string;
let talkId: string;
let viewerId: string;
let dietaryPermissionId: number;
const userIds: string[] = [];

async function lookupId(
  table: typeof genders | typeof dietaryRestrictions,
  label: string,
): Promise<number> {
  const [inserted] = await db
    .insert(table)
    .values({ label })
    .onConflictDoNothing()
    .returning({ id: table.id });
  if (inserted) return inserted.id;
  const [existing] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.label, label))
    .limit(1);
  return existing.id;
}

async function loadReport(id: string) {
  const result = await getDietaryReport(id);
  if (!result.success) throw new Error(result.error);
  return result.data!;
}

async function newUser(name: string, email: string) {
  const [row] = await db
    .insert(user)
    .values({ name, email, emailVerified: true })
    .returning({ id: user.id });
  userIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  const [mealType] = await db
    .insert(eventTypes)
    .values({ label: MEAL_EVENT_TYPE })
    .onConflictDoNothing()
    .returning({ id: eventTypes.id });
  const mealTypeId =
    mealType?.id ??
    (
      await db
        .select({ id: eventTypes.id })
        .from(eventTypes)
        .where(eq(eventTypes.label, MEAL_EVENT_TYPE))
        .limit(1)
    )[0].id;

  const genderId = await lookupId(genders, 'Prefer not to say');
  const veganId = await lookupId(dietaryRestrictions, 'Vegan');
  const otherId = await lookupId(dietaryRestrictions, 'Other');

  const [acceptedStatus] = await db
    .insert(participationStatuses)
    .values({
      label: 'accepted',
      title: 'Confirmed',
      description: 'Confirmed.',
      variant: 'success',
    })
    .onConflictDoNothing()
    .returning({ id: participationStatuses.id });
  const [invitedStatus] = await db
    .insert(participationStatuses)
    .values({
      label: 'invited',
      title: 'RSVP required',
      description: 'Please reply.',
      variant: 'purple',
    })
    .onConflictDoNothing()
    .returning({ id: participationStatuses.id });

  const statusId = async (label: string, inserted?: { id: number }) =>
    inserted?.id ??
    (
      await db
        .select({ id: participationStatuses.id })
        .from(participationStatuses)
        .where(eq(participationStatuses.label, label))
        .limit(1)
    )[0].id;

  const acceptedId = await statusId('accepted', acceptedStatus);
  const invitedId = await statusId('invited', invitedStatus);

  const [main] = await db
    .insert(events)
    .values({
      name: 'Dietary Parent',
      hasApplication: false,
      applicationQuestions: [],
      startsAt: hoursAgo(6),
      endsAt: hoursAhead(6),
    })
    .returning({ id: events.id });
  eventId = main.id;

  const children = await db
    .insert(events)
    .values([
      {
        parentEventId: eventId,
        eventTypeId: mealTypeId,
        name: 'Lunch',
        startsAt: hoursAgo(2),
        hasApplication: false,
        applicationQuestions: [],
      },
      {
        parentEventId: eventId,
        name: 'Keynote',
        startsAt: hoursAgo(1),
        hasApplication: false,
        applicationQuestions: [],
      },
    ])
    .returning({ id: events.id, name: events.name });
  lunchId = children.find((row) => row.name === 'Lunch')!.id;
  talkId = children.find((row) => row.name === 'Keynote')!.id;

  viewerId = await newUser('Dietary Viewer', 'dietary-viewer@test.dev');
  const vegan = await newUser('Vega Vegan', 'dietary-vegan@test.dev');
  const absent = await newUser('Absent Allan', 'dietary-absent@test.dev');
  const unanswered = await newUser('Maybe Mia', 'dietary-maybe@test.dev');

  const [perm] = await db
    .insert(permission)
    .values({ slug: 'dietary:read:all' })
    .onConflictDoNothing()
    .returning({ id: permission.id });
  dietaryPermissionId =
    perm?.id ??
    (
      await db
        .select({ id: permission.id })
        .from(permission)
        .where(eq(permission.slug, 'dietary:read:all'))
        .limit(1)
    )[0].id;
  await db
    .insert(userPermission)
    .values({ userId: viewerId, permissionId: dietaryPermissionId })
    .onConflictDoNothing();

  await db.insert(userProfiles).values([
    { userId: vegan, fullName: 'Vega Vegan', genderId },
    {
      userId: absent,
      fullName: 'Absent Allan',
      genderId,
      dietaryOtherText: 'No shellfish',
    },
  ]);
  await db.insert(userDietaryRestrictions).values([
    { userId: vegan, restrictionId: veganId },
    { userId: absent, restrictionId: otherId },
  ]);

  await db.insert(eventParticipants).values([
    { eventId, userId: vegan, statusId: acceptedId },
    { eventId, userId: absent, statusId: acceptedId },
    { eventId, userId: unanswered, statusId: invitedId },
  ]);

  await db.insert(checkIns).values([
    { eventId, userId: vegan, checkedInAt: doorAt },
    { eventId, userId: absent, checkedInAt: absentDoorAt },
    { eventId: talkId, userId: vegan, checkedInAt: keynoteAt },
    { eventId: lunchId, userId: vegan, checkedInAt: lunchAt },
  ]);

  vi.mocked(getUser).mockResolvedValue({
    id: viewerId,
    email: 'dietary-viewer@test.dev',
    name: 'Dietary Viewer',
    emailVerified: true,
  } as never);
});

afterAll(async () => {
  await db.delete(events).where(eq(events.parentEventId, eventId));
  await db.delete(events).where(eq(events.id, eventId));
  await db
    .delete(userPermission)
    .where(eq(userPermission.permissionId, dietaryPermissionId));
  await db.delete(permission).where(eq(permission.id, dietaryPermissionId));
  await db.delete(user).where(inArray(user.id, userIds));
});

describe('getDietaryReport', () => {
  test('refuses an unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getDietaryReport(eventId)).resolves.toMatchObject({
      success: false,
    });
  });

  test('refuses a caller without dietary:read:all', async () => {
    const strangerId = await newUser('No Perms', 'dietary-noperms@test.dev');
    vi.mocked(getUser).mockResolvedValueOnce({
      id: strangerId,
      email: 'dietary-noperms@test.dev',
      name: 'No Perms',
      emailVerified: true,
    } as never);
    await expect(getDietaryReport(eventId)).rejects.toThrow(/REDIRECT/);
  });

  test('a sub-event uses the root roster', async () => {
    const report = await loadReport(lunchId);
    const names = report.rows.map((row) => row.name).sort();
    expect(names).toEqual(['Absent Allan', 'Vega Vegan']);
    expect(report.hasMeals).toBe(true);
  });

  test('lists only accepted participants', async () => {
    const report = await loadReport(eventId);
    const names = report.rows.map((row) => row.name).sort();
    expect(names).toEqual(['Absent Allan', 'Vega Vegan']);
  });

  test('reads restrictions, Other free text and last seen', async () => {
    const { rows } = await loadReport(eventId);
    const vegan = rows.find((row) => row.name === 'Vega Vegan')!;
    const absent = rows.find((row) => row.name === 'Absent Allan')!;

    expect(vegan.restrictions).toEqual(['Vegan']);
    expect(vegan.otherText).toBeNull();
    expect(vegan.lastSeenAt).toBe(keynoteAt.toISOString());

    expect(absent.restrictions).toEqual(['Other']);
    expect(absent.otherText).toBe('No shellfish');
    expect(absent.lastSeenAt).toBe(absentDoorAt.toISOString());
  });

  test('counts only sub-events tagged as a meal', async () => {
    const report = await loadReport(eventId);
    expect(report.hasMeals).toBe(true);
    expect(report.currentMeal?.name).toBe('Lunch');
    expect(report.countedMealCount).toBe(0);
    expect(report.rows.every((row) => row.missedStreak === 0)).toBe(true);
    const absent = report.rows.find((row) => row.name === 'Absent Allan')!;
    expect(absent.notAtCurrentMeal).toBe(true);
  });
});
