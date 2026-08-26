import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import {
  user,
  events,
  eventInterestRegistrations,
  eventApplications,
  applicationStatuses,
  userProfiles,
  genders,
  universities,
  majors,
  yearsOfStudy,
} from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  cacheLife: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import {
  getOptions,
  getEventsWithUserStatus,
  getUserApplicationStatus,
  registerEventInterest,
  getPreviousFormSubmission,
  submitEventApplication,
} from '@/app/dashboard/events/actions';

type MockUser = { id: string; email: string; name: string; emailVerified: boolean };

let testUserId: string;
let testUser: MockUser;
let testEventId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(user)
    .values({ name: 'Events Test User', email: 'events-test@example.com', emailVerified: true })
    .returning({ id: user.id });
  testUserId = u.id;
  testUser = { id: testUserId, email: 'events-test@example.com', name: 'Events Test User', emailVerified: true };

  const [e] = await db
    .insert(events)
    .values({ name: 'Auth Test Event', hasApplication: false, applicationQuestions: [] })
    .returning({ id: events.id });
  testEventId = e.id;

  vi.mocked(getUser).mockResolvedValue(testUser as never);
});

afterAll(async () => {
  await db.delete(eventApplications).where(eq(eventApplications.userId, testUserId));
  await db.delete(eventInterestRegistrations).where(eq(eventInterestRegistrations.userId, testUserId));
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

describe('registerEventInterest', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await registerEventInterest(testEventId);
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
      .values({ name: 'App Status Event', hasApplication: true, applicationQuestions: [] })
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
      .values({ eventId: appEventId, userId: testUserId, statusId: pendingStatusId, responses: {} })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(eventApplications).where(eq(eventApplications.eventId, appEventId));
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
      .values({ name: 'Applied Event', hasApplication: true, applicationQuestions: [] })
      .returning({ id: events.id });
    appliedEventId = e.id;

    const [existing] = await db
      .select({ id: applicationStatuses.id })
      .from(applicationStatuses)
      .where(eq(applicationStatuses.label, 'pending_review'))
      .limit(1);
    pendingStatusId = existing?.id ?? (() => { throw new Error('pending_review status missing'); })();

    await db
      .insert(eventApplications)
      .values({ eventId: appliedEventId, userId: testUserId, statusId: pendingStatusId, responses: {} })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(eventApplications).where(eq(eventApplications.eventId, appliedEventId));
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

// ─── registerEventInterest — authenticated ────────────────────────────────────

describe('registerEventInterest — authenticated', () => {
  let interestEventId: string;
  let genderId: number;
  let universityId: number;
  let majorId: number;
  let yearId: number;

  beforeAll(async () => {
    const [e] = await db
      .insert(events)
      .values({ name: 'Interest Event', hasApplication: true, applicationQuestions: [] })
      .returning({ id: events.id });
    interestEventId = e.id;

    // Seed profile lookups needed by getUserProfile (called by registerEventInterest).
    type LookupTable = typeof genders | typeof universities | typeof majors | typeof yearsOfStudy;
    const upsertLookup = async (tbl: LookupTable, label: string): Promise<number> => {
      const [existing] = await db.select({ id: tbl.id }).from(tbl).where(eq(tbl.label, label)).limit(1);
      if (existing) return existing.id;
      const [inserted] = await db.insert(tbl).values({ label }).returning({ id: tbl.id });
      return inserted!.id;
    };

    genderId = await upsertLookup(genders, 'test-gender-ri');
    universityId = await upsertLookup(universities, 'test-uni-ri');
    majorId = await upsertLookup(majors, 'test-major-ri');
    yearId = await upsertLookup(yearsOfStudy, 'tst-yr-ri');

    // Create a profile so the interest registration succeeds.
    await db
      .insert(userProfiles)
      .values({
        userId: testUserId,
        fullName: 'Events Test User',
        genderId,
        universityId,
        majorId,
        yearOfStudyId: yearId,
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { fullName: 'Events Test User', genderId, universityId, majorId, yearOfStudyId: yearId },
      });
  });

  afterAll(async () => {
    await db.delete(eventInterestRegistrations).where(eq(eventInterestRegistrations.eventId, interestEventId));
    await db.delete(events).where(eq(events.id, interestEventId));
    await db.delete(userProfiles).where(eq(userProfiles.userId, testUserId));
    await db.delete(genders).where(eq(genders.label, 'test-gender-ri'));
    await db.delete(universities).where(eq(universities.label, 'test-uni-ri'));
    await db.delete(majors).where(eq(majors.label, 'test-major-ri'));
    await db.delete(yearsOfStudy).where(eq(yearsOfStudy.label, 'tst-yr-ri'));
  });

  test('registers interest when user has a profile', async () => {
    const result = await registerEventInterest(interestEventId);
    expect(result.success).toBe(true);
    const rows = await db
      .select()
      .from(eventInterestRegistrations)
      .where(
        eq(eventInterestRegistrations.userId, testUserId),
      );
    expect(rows.some((r) => r.eventId === interestEventId)).toBe(true);
  });

  test('getEventsWithUserStatus marks userHasRegisteredInterest=true', async () => {
    const results = await getEventsWithUserStatus();
    const found = results.find((e) => e.id === interestEventId);
    expect(found?.userHasRegisteredInterest).toBe(true);
  });
});
