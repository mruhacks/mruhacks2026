import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import {
  user,
  events,
  eventRsvpWaves,
  eventRsvpResponses,
  rsvpStatuses,
} from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  cacheLife: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import {
  getUserRsvpStatus,
  submitRsvpResponse,
} from '@/app/dashboard/events/actions';

let testUserId: string;
let testEventId: string;
let pendingStatusId: number;
let acceptedStatusId: number;
let declinedStatusId: number;
let wave1Id: string;
let wave2Id: string;

const respondBy = new Date('2026-09-01T23:59:59.000Z');

async function ensureRsvpStatus(
  label: string,
  title: string,
  description: string,
  variant: string,
  isFinal: boolean,
): Promise<number> {
  const [inserted] = await db
    .insert(rsvpStatuses)
    .values({ label, title, description, variant, isFinal })
    .onConflictDoNothing()
    .returning({ id: rsvpStatuses.id });

  if (inserted) return inserted.id;

  const [existing] = await db
    .select({ id: rsvpStatuses.id })
    .from(rsvpStatuses)
    .where(eq(rsvpStatuses.label, label))
    .limit(1);
  return existing.id;
}

beforeAll(async () => {
  pendingStatusId = await ensureRsvpStatus(
    'pending',
    'RSVP Invited',
    'Please respond',
    'default',
    false,
  );
  acceptedStatusId = await ensureRsvpStatus(
    'accepted',
    'RSVP Accepted',
    'Confirmed',
    'success',
    true,
  );
  declinedStatusId = await ensureRsvpStatus(
    'declined',
    'RSVP Declined',
    'Declined',
    'destructive',
    true,
  );

  const [eventRow] = await db
    .insert(events)
    .values({ name: 'RSVP Response Test Event', hasApplication: true })
    .returning({ id: events.id });
  testEventId = eventRow.id;

  const [userRow] = await db
    .insert(user)
    .values({
      name: 'RSVP Responder',
      email: 'rsvp-responder@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  testUserId = userRow.id;

  const [wave1] = await db
    .insert(eventRsvpWaves)
    .values({ eventId: testEventId, wave: 1, respondBy })
    .returning({ id: eventRsvpWaves.id });
  wave1Id = wave1.id;

  const [wave2] = await db
    .insert(eventRsvpWaves)
    .values({ eventId: testEventId, wave: 2, respondBy })
    .returning({ id: eventRsvpWaves.id });
  wave2Id = wave2.id;

  await db.insert(eventRsvpResponses).values([
    {
      rsvpWaveId: wave1Id,
      userId: testUserId,
      statusId: acceptedStatusId,
      respondedAt: new Date('2026-08-01T12:00:00.000Z'),
    },
    {
      rsvpWaveId: wave2Id,
      userId: testUserId,
      statusId: pendingStatusId,
    },
  ]);

  vi.mocked(getUser).mockResolvedValue({
    id: testUserId,
    name: 'RSVP Responder',
    email: 'rsvp-responder@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
  } as Awaited<ReturnType<typeof getUser>>);
});

afterAll(async () => {
  await db
    .delete(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, testEventId));
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(user).where(eq(user.id, testUserId));
});

describe('getUserRsvpStatus', () => {
  test('returns the latest wave response (wave descending)', async () => {
    const status = await getUserRsvpStatus(testEventId);

    expect(status).not.toBeNull();
    expect(status?.statusLabel).toBe('pending');
    expect(status?.respondBy).toEqual(respondBy);
    expect(status?.respondedAt).toBeNull();
  });

  test('returns null when the user has no RSVP', async () => {
    vi.mocked(getUser).mockResolvedValueOnce({
      id: '00000000-0000-0000-0000-000000000099',
      name: 'Nobody',
      email: 'nobody@example.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    } as Awaited<ReturnType<typeof getUser>>);

    const status = await getUserRsvpStatus(testEventId);
    expect(status).toBeNull();
  });
});

describe('submitRsvpResponse', () => {
  test('accepts the latest pending RSVP and sets responded_at', async () => {
    const result = await submitRsvpResponse(testEventId, 'accepted');
    expect(result.success).toBe(true);

    const status = await getUserRsvpStatus(testEventId);
    expect(status?.statusLabel).toBe('accepted');
    expect(status?.respondedAt).toBeInstanceOf(Date);

    const [wave2Row] = await db
      .select({
        statusId: eventRsvpResponses.statusId,
        respondedAt: eventRsvpResponses.respondedAt,
      })
      .from(eventRsvpResponses)
      .where(eq(eventRsvpResponses.rsvpWaveId, wave2Id))
      .limit(1);

    expect(wave2Row?.statusId).toBe(acceptedStatusId);
    expect(wave2Row?.respondedAt).toBeInstanceOf(Date);

    // Older wave stays accepted — submit must not rewrite wave 1.
    const [wave1Row] = await db
      .select({ statusId: eventRsvpResponses.statusId })
      .from(eventRsvpResponses)
      .where(eq(eventRsvpResponses.rsvpWaveId, wave1Id))
      .limit(1);
    expect(wave1Row?.statusId).toBe(acceptedStatusId);
  });

  test('rejects a second response on an already-answered RSVP', async () => {
    const result = await submitRsvpResponse(testEventId, 'declined');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Already responded');
    }
  });

  test('declines a fresh pending RSVP on a new event', async () => {
    const [otherEvent] = await db
      .insert(events)
      .values({ name: 'Decline RSVP Event', hasApplication: true })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: otherEvent.id,
        wave: 1,
        respondBy: new Date('2026-10-01T23:59:59.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: wave.id,
      userId: testUserId,
      statusId: pendingStatusId,
    });

    try {
      const result = await submitRsvpResponse(otherEvent.id, 'declined');
      expect(result.success).toBe(true);

      const status = await getUserRsvpStatus(otherEvent.id);
      expect(status?.statusLabel).toBe('declined');
      expect(status?.respondedAt).toBeInstanceOf(Date);

      const [row] = await db
        .select({ statusId: eventRsvpResponses.statusId })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.rsvpWaveId, wave.id))
        .limit(1);
      expect(row?.statusId).toBe(declinedStatusId);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
    }
  });
});
