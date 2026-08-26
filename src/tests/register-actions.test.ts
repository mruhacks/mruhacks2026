import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq, and } from 'drizzle-orm';
import { user, events, eventAttendees } from '@/db/schema';
import {
  registerForEvent,
  registerForEventFormAction,
  unregisterFromEvent,
} from '@/app/register/actions';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getUser } from '@/utils/auth';

let testUserId: string;
let testEventId: string;

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

  vi.mocked(getUser).mockResolvedValue({
    id: testUserId,
    email: 'register-test@example.com',
    name: 'Register Test User',
    emailVerified: true,
  } as never);
});

afterAll(async () => {
  await db.delete(eventAttendees).where(eq(eventAttendees.userId, testUserId));
  await db.delete(events).where(eq(events.id, testEventId));
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
      .from(eventAttendees)
      .where(
        and(
          eq(eventAttendees.userId, testUserId),
          eq(eventAttendees.eventId, testEventId),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  test('double-registration is idempotent (onConflictDoNothing)', async () => {
    const result = await registerForEvent(testEventId);
    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(eventAttendees)
      .where(
        and(
          eq(eventAttendees.userId, testUserId),
          eq(eventAttendees.eventId, testEventId),
        ),
      );
    expect(rows).toHaveLength(1);
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
      .delete(eventAttendees)
      .where(
        and(
          eq(eventAttendees.userId, testUserId),
          eq(eventAttendees.eventId, testEventId),
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
    await db
      .insert(eventAttendees)
      .values({ userId: testUserId, eventId: testEventId })
      .onConflictDoNothing();
    const result = await unregisterFromEvent(testEventId);
    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(eventAttendees)
      .where(
        and(
          eq(eventAttendees.userId, testUserId),
          eq(eventAttendees.eventId, testEventId),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  test('unregistering when not registered is a no-op', async () => {
    const result = await unregisterFromEvent(testEventId);
    expect(result.success).toBe(true);
  });
});
