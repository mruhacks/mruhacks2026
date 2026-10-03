import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq, and } from 'drizzle-orm';
import { user, events, eventParticipants } from '@/db/schema';
import { insertAttendees } from '@/tests/participation-fixtures';
import {
  registerForEvent,
  registerForEventFormAction,
  unregisterFromEvent,
} from '@/app/register/actions';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

import { getUser } from '@/utils/auth';

let testUserId: string;
let testEventId: string;
let elapsedEventId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(user)
    .values({
      name: 'Register Test User',
      email: 'register-test@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  testUserId = u.id;

  const [e] = await db
    .insert(events)
    .values({ name: 'Test Register Event', hasApplication: false })
    .returning({ id: events.id });
  testEventId = e.id;

  const [elapsed] = await db
    .insert(events)
    .values({
      name: 'Test Elapsed Register Event',
      hasApplication: false,
      endsAt: new Date(Date.now() - 60_000),
    })
    .returning({ id: events.id });
  elapsedEventId = elapsed.id;

  vi.mocked(getUser).mockResolvedValue({
    id: testUserId,
    email: 'register-test@example.com',
    name: 'Register Test User',
    emailVerified: true,
  } as never);
});

afterAll(async () => {
  await db
    .delete(eventParticipants)
    .where(eq(eventParticipants.userId, testUserId));
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(events).where(eq(events.id, elapsedEventId));
  await db.delete(user).where(eq(user.id, testUserId));
});

describe('registerForEvent', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await registerForEvent(testEventId);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('authenticated');
  });

  test('registers the user for the event', async () => {
    const result = await registerForEvent(testEventId);
    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.userId, testUserId),
          eq(eventParticipants.eventId, testEventId),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  test('double-registration is idempotent (onConflictDoNothing)', async () => {
    const result = await registerForEvent(testEventId);
    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.userId, testUserId),
          eq(eventParticipants.eventId, testEventId),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  test('rejects registering for an event that has already ended', async () => {
    const result = await registerForEvent(elapsedEventId);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('ended');
  });
});

describe('registerForEvent capacity', () => {
  let cappedEventId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const [e] = await db
      .insert(events)
      .values({
        name: 'Test Capped Event',
        hasApplication: false,
        capacity: 1,
      })
      .returning({ id: events.id });
    cappedEventId = e.id;

    const [u] = await db
      .insert(user)
      .values({
        name: 'Register Test User 2',
        email: 'register-test-2@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    otherUserId = u.id;
  });

  afterAll(async () => {
    await db
      .delete(eventParticipants)
      .where(eq(eventParticipants.eventId, cappedEventId));
    await db.delete(events).where(eq(events.id, cappedEventId));
    await db.delete(user).where(eq(user.id, otherUserId));
  });

  test('allows registration up to capacity, rejects once full', async () => {
    vi.mocked(getUser).mockResolvedValueOnce({
      id: testUserId,
      email: 'register-test@example.com',
      name: 'Register Test User',
      emailVerified: true,
    } as never);
    const first = await registerForEvent(cappedEventId);
    expect(first.success).toBe(true);

    vi.mocked(getUser).mockResolvedValueOnce({
      id: otherUserId,
      email: 'register-test-2@example.com',
      name: 'Register Test User 2',
      emailVerified: true,
    } as never);
    const second = await registerForEvent(cappedEventId);
    expect(second.success).toBe(false);
    expect((second as { error: string }).error).toContain('full');

    const rows = await db
      .select()
      .from(eventParticipants)
      .where(eq(eventParticipants.eventId, cappedEventId));
    expect(rows).toHaveLength(1);
  });

  test('re-registering an existing attendee stays a no-op even when full', async () => {
    vi.mocked(getUser).mockResolvedValueOnce({
      id: testUserId,
      email: 'register-test@example.com',
      name: 'Register Test User',
      emailVerified: true,
    } as never);
    const result = await registerForEvent(cappedEventId);
    expect(result.success).toBe(true);
  });
});

describe('registerForEventFormAction', () => {
  test('returns error when eventId is missing from FormData', async () => {
    const formData = new FormData();
    const result = await registerForEventFormAction(formData);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('event ID');
  });

  test('registers when valid eventId is in FormData', async () => {
    await db
      .delete(eventParticipants)
      .where(
        and(
          eq(eventParticipants.userId, testUserId),
          eq(eventParticipants.eventId, testEventId),
        ),
      );
    const formData = new FormData();
    formData.set('eventId', testEventId);
    const result = await registerForEventFormAction(formData);
    expect(result.success).toBe(true);
  });
});

describe('unregisterFromEvent', () => {
  test('returns error when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await unregisterFromEvent(testEventId);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('authenticated');
  });

  test('removes the attendee row', async () => {
    await insertAttendees({ userId: testUserId, eventId: testEventId });
    const result = await unregisterFromEvent(testEventId);
    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.userId, testUserId),
          eq(eventParticipants.eventId, testEventId),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  test('unregistering when not registered is a no-op', async () => {
    const result = await unregisterFromEvent(testEventId);
    expect(result.success).toBe(true);
  });

  test('rejects unregistering from an event that has already ended', async () => {
    await insertAttendees({ userId: testUserId, eventId: elapsedEventId });
    const result = await unregisterFromEvent(elapsedEventId);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('ended');
  });
});
