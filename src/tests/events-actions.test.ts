import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import {
  user,
  events,
  eventApplications,
  applicationStatuses,
  userProfiles,
  userProfileAbout,
  genders,
  universities,
  majors,
  yearsOfStudy,
} from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import {
  getOptions,
  getEventsWithUserStatus,
  getUserApplicationStatus,
  getPreviousFormSubmission,
  submitEventApplication,
} from '@/app/dashboard/events/actions';

type MockUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

let testUserId: string;
let testUser: MockUser;
let testEventId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(user)
    .values({
      name: 'Events Test User',
      email: 'events-test@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  testUserId = u.id;
  testUser = {
    id: testUserId,
    email: 'events-test@example.com',
    name: 'Events Test User',
    emailVerified: true,
  };

  const [e] = await db
    .insert(events)
    .values({
      name: 'Auth Test Event',
      hasApplication: false,
      applicationQuestions: [],
    })
    .returning({ id: events.id });
  testEventId = e.id;

  vi.mocked(getUser).mockResolvedValue(testUser as never);
});

afterAll(async () => {
  await db
    .delete(eventApplications)
    .where(eq(eventApplications.userId, testUserId));
  await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(user).where(eq(user.id, testUserId));
});

describe('getOptions', () => {
  test('throws when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getOptions()).rejects.toThrow('Not authenticated');
  });

  test('returns options with expected keys when authenticated', async () => {
    const result = await getOptions();
    expect(result).toHaveProperty('genders');
    expect(result).toHaveProperty('universities');
    expect(result).toHaveProperty('majors');
    expect(result).toHaveProperty('years');
    expect(result).toHaveProperty('dietary');
    expect(Array.isArray(result.genders)).toBe(true);
    expect(Array.isArray(result.universities)).toBe(true);
  });
});

describe('getEventsWithUserStatus', () => {
  test('returns empty array when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await getEventsWithUserStatus();
    expect(result).toEqual([]);
  });

  test('returns events list when authenticated', async () => {
    const result = await getEventsWithUserStatus();
    expect(Array.isArray(result)).toBe(true);
    const found = result.find((e) => e.id === testEventId);
    expect(found).toBeDefined();
    expect(found?.userStatus).toBeNull();
  });
});

describe('getUserApplicationStatus', () => {
  test('returns null when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await getUserApplicationStatus(testEventId);
    expect(result).toBeNull();
  });

  test('returns null when no application exists', async () => {
    const result = await getUserApplicationStatus(testEventId);
    expect(result).toBeNull();
  });
});

describe('getPreviousFormSubmission', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await getPreviousFormSubmission(testEventId);
    expect(result.success).toBe(false);
  });
});

describe('submitEventApplication', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await submitEventApplication({} as never, testEventId);
    expect(result.success).toBe(false);
  });

  test('fails when user has no profile', async () => {
    await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
    const result = await submitEventApplication({} as never, testEventId);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/profile/i);
  });
});

// ─── getUserApplicationStatus — with application ──────────────────────────────

describe('getUserApplicationStatus — with application', () => {
  let pendingStatusId: number;
  let appEventId: string;

  beforeAll(async () => {
    const [e] = await db
      .insert(events)
      .values({
        name: 'App Status Event',
        hasApplication: true,
        applicationQuestions: [],
      })
      .returning({ id: events.id });
    appEventId = e.id;

    // Seed a pending_review status if it doesn't exist.
    const [existing] = await db
      .select({ id: applicationStatuses.id })
      .from(applicationStatuses)
      .where(eq(applicationStatuses.label, 'pending_review'))
      .limit(1);
    if (existing) {
      pendingStatusId = existing.id;
    } else {
      const [inserted] = await db
        .insert(applicationStatuses)
        .values({
          label: 'pending_review',
          title: 'Under review',
          description: 'Being reviewed.',
          variant: 'default',
          isFinal: false,
        })
        .returning({ id: applicationStatuses.id });
      pendingStatusId = inserted.id;
    }

    await db
      .insert(eventApplications)
      .values({
        eventId: appEventId,
        userId: testUserId,
        statusId: pendingStatusId,
        responses: {},
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db
      .delete(eventApplications)
      .where(eq(eventApplications.eventId, appEventId));
    await db.delete(events).where(eq(events.id, appEventId));
  });

  test('returns application status when an application exists', async () => {
    const result = await getUserApplicationStatus(appEventId);
    expect(result).not.toBeNull();
    expect(result?.statusKey).toBe('pending_review');
    expect(result?.applicationId).toBeTruthy();
  });
});

// ─── getEventsWithUserStatus — applied user ───────────────────────────────────

describe('getEventsWithUserStatus — applied user', () => {
  let appliedEventId: string;
  let pendingStatusId: number;

  beforeAll(async () => {
    const [e] = await db
      .insert(events)
      .values({
        name: 'Applied Event',
        hasApplication: true,
        applicationQuestions: [],
      })
      .returning({ id: events.id });
    appliedEventId = e.id;

    const [existing] = await db
      .select({ id: applicationStatuses.id })
      .from(applicationStatuses)
      .where(eq(applicationStatuses.label, 'pending_review'))
      .limit(1);
    pendingStatusId =
      existing?.id ??
      (() => {
        throw new Error('pending_review status missing');
      })();

    await db
      .insert(eventApplications)
      .values({
        eventId: appliedEventId,
        userId: testUserId,
        statusId: pendingStatusId,
        responses: {},
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db
      .delete(eventApplications)
      .where(eq(eventApplications.eventId, appliedEventId));
    await db.delete(events).where(eq(events.id, appliedEventId));
  });

  test('shows userStatus as applied for an event with an application', async () => {
    const results = await getEventsWithUserStatus();
    const found = results.find((e) => e.id === appliedEventId);
    expect(found).toBeDefined();
    expect(found?.userStatus).toBe('applied');
    expect(found?.statusKey).toBe('pending_review');
  });
});

// ─── submitEventApplication — edit restrictions ───────────────────────────────

describe('submitEventApplication — edit restrictions', () => {
  let openEventId: string;
  let elapsedEventId: string;
  let pendingStatusId: number;
  let approvedStatusId: number;

  beforeAll(async () => {
    const [gender] = await db.select({ id: genders.id }).from(genders).limit(1);
    const [university] = await db
      .select({ id: universities.id })
      .from(universities)
      .limit(1);
    const [major] = await db.select({ id: majors.id }).from(majors).limit(1);
    const [year] = await db
      .select({ id: yearsOfStudy.id })
      .from(yearsOfStudy)
      .limit(1);
    if (!gender || !university || !major || !year) {
      throw new Error('Expected lookup tables to be seeded.');
    }

    await db
      .insert(userProfiles)
      .values({
        userId: testUserId,
        fullName: 'Events Test User',
        genderId: gender.id,
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { fullName: 'Events Test User', genderId: gender.id },
      });
    await db
      .insert(userProfileAbout)
      .values({
        userId: testUserId,
        universityId: university.id,
        majorId: major.id,
        yearOfStudyId: year.id,
      })
      .onConflictDoUpdate({
        target: userProfileAbout.userId,
        set: {
          universityId: university.id,
          majorId: major.id,
          yearOfStudyId: year.id,
        },
      });

    const [pending] = await db
      .select({ id: applicationStatuses.id })
      .from(applicationStatuses)
      .where(eq(applicationStatuses.label, 'pending_review'))
      .limit(1);
    pendingStatusId =
      pending?.id ??
      (() => {
        throw new Error('pending_review status missing');
      })();

    const [approved] = await db
      .select({ id: applicationStatuses.id })
      .from(applicationStatuses)
      .where(eq(applicationStatuses.label, 'approved'))
      .limit(1);
    approvedStatusId =
      approved?.id ??
      (() => {
        throw new Error('approved status missing');
      })();

    const [open] = await db
      .insert(events)
      .values({
        name: 'Edit Restriction Event',
        hasApplication: true,
        applicationQuestions: [],
      })
      .returning({ id: events.id });
    openEventId = open.id;

    const [elapsed] = await db
      .insert(events)
      .values({
        name: 'Edit Restriction Elapsed Event',
        hasApplication: true,
        applicationQuestions: [],
        endsAt: new Date(Date.now() - 60_000),
      })
      .returning({ id: events.id });
    elapsedEventId = elapsed.id;
  });

  afterAll(async () => {
    await db
      .delete(eventApplications)
      .where(eq(eventApplications.eventId, openEventId));
    await db
      .delete(eventApplications)
      .where(eq(eventApplications.eventId, elapsedEventId));
    await db.delete(events).where(eq(events.id, openEventId));
    await db.delete(events).where(eq(events.id, elapsedEventId));
    await db
      .delete(userProfileAbout)
      .where(eq(userProfileAbout.userId, testUserId));
  });

  test('allows editing while the application is still pending review', async () => {
    await db
      .insert(eventApplications)
      .values({
        eventId: openEventId,
        userId: testUserId,
        statusId: pendingStatusId,
        responses: {},
      })
      .onConflictDoUpdate({
        target: [eventApplications.eventId, eventApplications.userId],
        set: { statusId: pendingStatusId },
      });

    const result = await submitEventApplication(
      { applicationResponses: {} },
      openEventId,
    );
    expect(result.success).toBe(true);
  });

  test('rejects editing once the application has been decided', async () => {
    await db
      .update(eventApplications)
      .set({ statusId: approvedStatusId })
      .where(eq(eventApplications.eventId, openEventId));

    const result = await submitEventApplication(
      { applicationResponses: {} },
      openEventId,
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(
      /already been reviewed/i,
    );
  });

  test('rejects editing once the event has ended', async () => {
    const result = await submitEventApplication(
      { applicationResponses: {} },
      elapsedEventId,
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/ended/i);
  });
});
