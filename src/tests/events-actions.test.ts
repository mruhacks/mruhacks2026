import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import { user, events, eventInterestRegistrations } from '@/db/schema';

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
  await db.delete(eventInterestRegistrations).where(eq(eventInterestRegistrations.userId, testUserId));
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
});
