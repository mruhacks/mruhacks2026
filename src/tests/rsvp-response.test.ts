import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import {
  user,
  events,
  eventAttendees,
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
import { revalidatePath } from 'next/cache';
import {
  getUserRsvpStatus,
  getEventsWithUserStatus,
  submitRsvpResponse,
} from '@/app/dashboard/events/actions';
import { timeoutExpiredRsvpResponses } from '@/lib/rsvp/timeout-expired-rsvp-responses';

let testUserId: string;
let testEventId: string;
let pendingStatusId: number;
let acceptedStatusId: number;
let declinedStatusId: number;
let timedOutStatusId: number;
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

async function countAttendees(eventId: string, userId: string): Promise<number> {
  const rows = await db
    .select({ eventId: eventAttendees.eventId })
    .from(eventAttendees)
    .where(
      and(
        eq(eventAttendees.eventId, eventId),
        eq(eventAttendees.userId, userId),
      ),
    );
  return rows.length;
}

async function countEventAttendees(eventId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(eventAttendees)
    .where(eq(eventAttendees.eventId, eventId));
  return Number(value);
}

function mockSession(userId: string, name: string, email: string) {
  vi.mocked(getUser).mockResolvedValue({
    id: userId,
    name,
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
  } as Awaited<ReturnType<typeof getUser>>);
}

function restoreDefaultSession() {
  mockSession(testUserId, 'RSVP Responder', 'rsvp-responder@example.com');
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
  timedOutStatusId = await ensureRsvpStatus(
    'timed_out',
    'RSVP Expired',
    'Deadline passed',
    'secondary',
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
    .delete(eventAttendees)
    .where(eq(eventAttendees.userId, testUserId));
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

  test('treats stored pending with expired respondBy as timed_out without persisting', async () => {
    const [otherEvent] = await db
      .insert(events)
      .values({
        name: 'Expired Pending Read Event',
        hasApplication: true,
      })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: otherEvent.id,
        wave: 1,
        respondBy: new Date('2020-01-01T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    const [response] = await db
      .insert(eventRsvpResponses)
      .values({
        rsvpWaveId: wave.id,
        userId: testUserId,
        statusId: pendingStatusId,
      })
      .returning({ id: eventRsvpResponses.id });

    try {
      restoreDefaultSession();
      const status = await getUserRsvpStatus(otherEvent.id);
      expect(status?.statusLabel).toBe('timed_out');

      const [stored] = await db
        .select({ statusId: eventRsvpResponses.statusId })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.id, response.id))
        .limit(1);
      expect(stored?.statusId).toBe(pendingStatusId);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
      restoreDefaultSession();
    }
  });

  test('accepted with expired respondBy remains accepted', async () => {
    const [otherEvent] = await db
      .insert(events)
      .values({
        name: 'Expired Accepted Read Event',
        hasApplication: true,
      })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: otherEvent.id,
        wave: 1,
        respondBy: new Date('2020-01-01T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: wave.id,
      userId: testUserId,
      statusId: acceptedStatusId,
      respondedAt: new Date('2020-01-02T00:00:00.000Z'),
    });

    try {
      restoreDefaultSession();
      const status = await getUserRsvpStatus(otherEvent.id);
      expect(status?.statusLabel).toBe('accepted');
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
      restoreDefaultSession();
    }
  });

  test('declined with expired respondBy remains declined', async () => {
    const [otherEvent] = await db
      .insert(events)
      .values({
        name: 'Expired Declined Read Event',
        hasApplication: true,
      })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: otherEvent.id,
        wave: 1,
        respondBy: new Date('2020-01-01T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: wave.id,
      userId: testUserId,
      statusId: declinedStatusId,
      respondedAt: new Date('2020-01-02T00:00:00.000Z'),
    });

    try {
      restoreDefaultSession();
      const status = await getUserRsvpStatus(otherEvent.id);
      expect(status?.statusLabel).toBe('declined');
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
      restoreDefaultSession();
    }
  });
});

describe('submitRsvpResponse', () => {
  test('accepts the latest pending RSVP, sets responded_at, and creates an attendee', async () => {
    vi.mocked(revalidatePath).mockClear();

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
    expect(await countAttendees(testEventId, testUserId)).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith(
      `/dashboard/events/${testEventId}`,
    );
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/events');

    // Older wave stays accepted — submit must not rewrite wave 1.
    const [wave1Row] = await db
      .select({ statusId: eventRsvpResponses.statusId })
      .from(eventRsvpResponses)
      .where(eq(eventRsvpResponses.rsvpWaveId, wave1Id))
      .limit(1);
    expect(wave1Row?.statusId).toBe(acceptedStatusId);
  });

  test('rejects a second response and does not create duplicate attendees', async () => {
    const before = await countAttendees(testEventId, testUserId);
    const result = await submitRsvpResponse(testEventId, 'accepted');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Already responded');
    }
    expect(await countAttendees(testEventId, testUserId)).toBe(before);
  });

  test('accept is idempotent when an attendee row already exists', async () => {
    const [otherEvent] = await db
      .insert(events)
      .values({
        name: 'Existing Attendee RSVP Event',
        hasApplication: true,
        capacity: 1,
      })
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
    await db.insert(eventAttendees).values({
      eventId: otherEvent.id,
      userId: testUserId,
    });

    try {
      const result = await submitRsvpResponse(otherEvent.id, 'accepted');
      expect(result.success).toBe(true);
      expect(await countAttendees(otherEvent.id, testUserId)).toBe(1);

      const status = await getUserRsvpStatus(otherEvent.id);
      expect(status?.statusLabel).toBe('accepted');
    } finally {
      await db
        .delete(eventAttendees)
        .where(eq(eventAttendees.eventId, otherEvent.id));
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
    }
  });

  test('declines a pending RSVP without creating an attendee', async () => {
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
      expect(await countAttendees(otherEvent.id, testUserId)).toBe(0);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
    }
  });

  test('rolls back RSVP accept when attendee creation fails', async () => {
    const [otherEvent] = await db
      .insert(events)
      .values({ name: 'Rollback RSVP Event', hasApplication: true })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: otherEvent.id,
        wave: 1,
        respondBy: new Date('2026-10-15T23:59:59.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    const [response] = await db
      .insert(eventRsvpResponses)
      .values({
        rsvpWaveId: wave.id,
        userId: testUserId,
        statusId: pendingStatusId,
      })
      .returning({ id: eventRsvpResponses.id });

    const originalTransaction = db.transaction.bind(db);
    const transactionSpy = vi
      .spyOn(db, 'transaction')
      .mockImplementationOnce(async (callback) => {
        return originalTransaction(async (tx) => {
          const originalInsert = tx.insert.bind(tx);
          // Force attendee insert to fail after the RSVP update runs.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tx as any).insert = (table: unknown) => {
            if (table === eventAttendees) {
              throw new Error('forced attendee insert failure');
            }
            return originalInsert(table as typeof eventAttendees);
          };
          return callback(tx);
        });
      });

    try {
      const result = await submitRsvpResponse(otherEvent.id, 'accepted');
      expect(result.success).toBe(false);

      const [row] = await db
        .select({
          statusId: eventRsvpResponses.statusId,
          respondedAt: eventRsvpResponses.respondedAt,
        })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.id, response.id))
        .limit(1);

      expect(row?.statusId).toBe(pendingStatusId);
      expect(row?.respondedAt).toBeNull();
      expect(await countAttendees(otherEvent.id, testUserId)).toBe(0);
    } finally {
      transactionSpy.mockRestore();
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
    }
  });

  test('accepts when spots are available under a capacity limit', async () => {
    const [capEvent] = await db
      .insert(events)
      .values({
        name: 'RSVP Capacity Available Event',
        hasApplication: true,
        capacity: 2,
      })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: capEvent.id,
        wave: 1,
        respondBy: new Date('2099-10-01T23:59:59.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: wave.id,
      userId: testUserId,
      statusId: pendingStatusId,
    });

    try {
      restoreDefaultSession();
      const result = await submitRsvpResponse(capEvent.id, 'accepted');
      expect(result.success).toBe(true);
      expect(await countEventAttendees(capEvent.id)).toBe(1);
      expect(await countAttendees(capEvent.id, testUserId)).toBe(1);

      const status = await getUserRsvpStatus(capEvent.id);
      expect(status?.statusLabel).toBe('accepted');
    } finally {
      await db
        .delete(eventAttendees)
        .where(eq(eventAttendees.eventId, capEvent.id));
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, capEvent.id));
      await db.delete(events).where(eq(events.id, capEvent.id));
      restoreDefaultSession();
    }
  });

  test('accepts the final available spot', async () => {
    const [capEvent] = await db
      .insert(events)
      .values({
        name: 'RSVP Final Spot Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: capEvent.id,
        wave: 1,
        respondBy: new Date('2099-10-01T23:59:59.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: wave.id,
      userId: testUserId,
      statusId: pendingStatusId,
    });

    try {
      restoreDefaultSession();
      const result = await submitRsvpResponse(capEvent.id, 'accepted');
      expect(result.success).toBe(true);
      expect(await countEventAttendees(capEvent.id)).toBe(1);

      const status = await getUserRsvpStatus(capEvent.id);
      expect(status?.statusLabel).toBe('accepted');
    } finally {
      await db
        .delete(eventAttendees)
        .where(eq(eventAttendees.eventId, capEvent.id));
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, capEvent.id));
      await db.delete(events).where(eq(events.id, capEvent.id));
      restoreDefaultSession();
    }
  });

  test('refuses accept when capacity is already full and does not mark RSVP accepted', async () => {
    const [capEvent] = await db
      .insert(events)
      .values({
        name: 'RSVP Already Full Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: events.id });

    const [filler] = await db
      .insert(user)
      .values({
        name: 'Capacity Filler',
        email: 'rsvp-capacity-filler@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: capEvent.id,
        wave: 1,
        respondBy: new Date('2099-10-01T23:59:59.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventAttendees).values({
      eventId: capEvent.id,
      userId: filler.id,
    });
    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: wave.id,
      userId: testUserId,
      statusId: pendingStatusId,
    });

    try {
      restoreDefaultSession();
      const result = await submitRsvpResponse(capEvent.id, 'accepted');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/at capacity/i);
      }

      const [response] = await db
        .select({
          statusId: eventRsvpResponses.statusId,
          respondedAt: eventRsvpResponses.respondedAt,
        })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.rsvpWaveId, wave.id))
        .limit(1);

      expect(response?.statusId).toBe(pendingStatusId);
      expect(response?.respondedAt).toBeNull();
      expect(await countAttendees(capEvent.id, testUserId)).toBe(0);
      expect(await countEventAttendees(capEvent.id)).toBe(1);
    } finally {
      await db
        .delete(eventAttendees)
        .where(eq(eventAttendees.eventId, capEvent.id));
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, capEvent.id));
      await db.delete(events).where(eq(events.id, capEvent.id));
      await db.delete(user).where(eq(user.id, filler.id));
      restoreDefaultSession();
    }
  });

  test('concurrent accepts cannot both claim the last spot', async () => {
    const [capEvent] = await db
      .insert(events)
      .values({
        name: 'RSVP Concurrent Capacity Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: events.id });

    const [userA] = await db
      .insert(user)
      .values({
        name: 'Capacity Racer A',
        email: 'rsvp-capacity-racer-a@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id, name: user.name, email: user.email });
    const [userB] = await db
      .insert(user)
      .values({
        name: 'Capacity Racer B',
        email: 'rsvp-capacity-racer-b@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id, name: user.name, email: user.email });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: capEvent.id,
        wave: 1,
        respondBy: new Date('2099-10-01T23:59:59.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values([
      {
        rsvpWaveId: wave.id,
        userId: userA.id,
        statusId: pendingStatusId,
      },
      {
        rsvpWaveId: wave.id,
        userId: userB.id,
        statusId: pendingStatusId,
      },
    ]);

    const sessions = [
      {
        id: userA.id,
        name: userA.name,
        email: userA.email,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: null,
      },
      {
        id: userB.id,
        name: userB.name,
        email: userB.email,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: null,
      },
    ];

    vi.mocked(getUser).mockImplementation(async () => {
      const next = sessions.shift();
      if (!next) {
        throw new Error('unexpected extra getUser call');
      }
      return next as Awaited<ReturnType<typeof getUser>>;
    });

    try {
      const results = await Promise.all([
        submitRsvpResponse(capEvent.id, 'accepted'),
        submitRsvpResponse(capEvent.id, 'accepted'),
      ]);

      const successes = results.filter((result) => result.success);
      const failures = results.filter((result) => !result.success);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      if (!failures[0].success) {
        expect(failures[0].error).toMatch(/at capacity/i);
      }
      expect(await countEventAttendees(capEvent.id)).toBe(1);

      const responseRows = await db
        .select({
          userId: eventRsvpResponses.userId,
          statusId: eventRsvpResponses.statusId,
        })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.rsvpWaveId, wave.id));

      const acceptedCount = responseRows.filter(
        (response) => response.statusId === acceptedStatusId,
      ).length;
      const pendingCount = responseRows.filter(
        (response) => response.statusId === pendingStatusId,
      ).length;
      expect(acceptedCount).toBe(1);
      expect(pendingCount).toBe(1);
    } finally {
      restoreDefaultSession();
      await db
        .delete(eventAttendees)
        .where(eq(eventAttendees.eventId, capEvent.id));
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, capEvent.id));
      await db.delete(events).where(eq(events.id, capEvent.id));
      await db.delete(user).where(eq(user.id, userA.id));
      await db.delete(user).where(eq(user.id, userB.id));
    }
  });
});

describe('timeoutExpiredRsvpResponses', () => {
  test('marks expired pending RSVPs as timed_out and blocks accept/decline', async () => {
    const [otherEvent] = await db
      .insert(events)
      .values({ name: 'Expired RSVP Event', hasApplication: true })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: otherEvent.id,
        wave: 1,
        respondBy: new Date('2020-01-01T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    const [response] = await db
      .insert(eventRsvpResponses)
      .values({
        rsvpWaveId: wave.id,
        userId: testUserId,
        statusId: pendingStatusId,
      })
      .returning({ id: eventRsvpResponses.id });

    try {
      const timeoutResult = await timeoutExpiredRsvpResponses({
        eventId: otherEvent.id,
        userId: testUserId,
      });
      expect(timeoutResult.timedOutCount).toBe(1);

      const [row] = await db
        .select({
          statusId: eventRsvpResponses.statusId,
          respondedAt: eventRsvpResponses.respondedAt,
        })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.id, response.id))
        .limit(1);

      expect(row?.statusId).toBe(timedOutStatusId);
      expect(row?.respondedAt).toBeNull();
      expect(await countAttendees(otherEvent.id, testUserId)).toBe(0);

      const status = await getUserRsvpStatus(otherEvent.id);
      expect(status?.statusLabel).toBe('timed_out');

      const acceptResult = await submitRsvpResponse(otherEvent.id, 'accepted');
      expect(acceptResult.success).toBe(false);
      if (!acceptResult.success) {
        expect(acceptResult.error).toContain('deadline');
      }

      const declineResult = await submitRsvpResponse(otherEvent.id, 'declined');
      expect(declineResult.success).toBe(false);
      expect(await countAttendees(otherEvent.id, testUserId)).toBe(0);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
    }
  });

  test('does not time out accepted or declined responses', async () => {
    const [otherEvent] = await db
      .insert(events)
      .values({ name: 'Final RSVP Event', hasApplication: true })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: otherEvent.id,
        wave: 1,
        respondBy: new Date('2020-01-01T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    const [acceptedResponse] = await db
      .insert(eventRsvpResponses)
      .values({
        rsvpWaveId: wave.id,
        userId: testUserId,
        statusId: acceptedStatusId,
        respondedAt: new Date('2020-01-02T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpResponses.id });

    const [otherUser] = await db
      .insert(user)
      .values({
        name: 'Declined User',
        email: 'rsvp-declined-timeout@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    const [declinedResponse] = await db
      .insert(eventRsvpResponses)
      .values({
        rsvpWaveId: wave.id,
        userId: otherUser.id,
        statusId: declinedStatusId,
        respondedAt: new Date('2020-01-02T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpResponses.id });

    try {
      const timeoutResult = await timeoutExpiredRsvpResponses({
        eventId: otherEvent.id,
      });
      expect(timeoutResult.timedOutCount).toBe(0);

      const [acceptedRow] = await db
        .select({ statusId: eventRsvpResponses.statusId })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.id, acceptedResponse.id))
        .limit(1);
      const [declinedRow] = await db
        .select({ statusId: eventRsvpResponses.statusId })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.id, declinedResponse.id))
        .limit(1);

      expect(acceptedRow?.statusId).toBe(acceptedStatusId);
      expect(declinedRow?.statusId).toBe(declinedStatusId);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
      await db.delete(user).where(eq(user.id, otherUser.id));
    }
  });

  test('does not write a second timeout when the sweep runs twice', async () => {
    const [otherEvent] = await db
      .insert(events)
      .values({ name: 'Idempotent Timeout Event', hasApplication: true })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: otherEvent.id,
        wave: 1,
        respondBy: new Date('2020-01-01T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    const [response] = await db
      .insert(eventRsvpResponses)
      .values({
        rsvpWaveId: wave.id,
        userId: testUserId,
        statusId: pendingStatusId,
      })
      .returning({ id: eventRsvpResponses.id });

    try {
      const first = await timeoutExpiredRsvpResponses({
        eventId: otherEvent.id,
        userId: testUserId,
      });
      expect(first.timedOutCount).toBe(1);

      const second = await timeoutExpiredRsvpResponses({
        eventId: otherEvent.id,
        userId: testUserId,
      });
      expect(second.timedOutCount).toBe(0);

      const [row] = await db
        .select({ statusId: eventRsvpResponses.statusId })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.id, response.id))
        .limit(1);
      expect(row?.statusId).toBe(timedOutStatusId);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
    }
  });
});

describe('getEventsWithUserStatus', () => {
  test('does not return an expired pending invite as pending', async () => {
    const [otherEvent] = await db
      .insert(events)
      .values({
        name: 'Listing Expired Pending Event',
        hasApplication: true,
      })
      .returning({ id: events.id });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: otherEvent.id,
        wave: 1,
        respondBy: new Date('2020-01-01T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    const [response] = await db
      .insert(eventRsvpResponses)
      .values({
        rsvpWaveId: wave.id,
        userId: testUserId,
        statusId: pendingStatusId,
      })
      .returning({ id: eventRsvpResponses.id });

    try {
      restoreDefaultSession();
      const eventsList = await getEventsWithUserStatus();
      const listed = eventsList.find((event) => event.id === otherEvent.id);
      expect(listed?.rsvpStatusLabel).toBe('timed_out');
      expect(listed?.rsvpStatusLabel).not.toBe('pending');

      const [stored] = await db
        .select({ statusId: eventRsvpResponses.statusId })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.id, response.id))
        .limit(1);
      expect(stored?.statusId).toBe(pendingStatusId);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, otherEvent.id));
      await db.delete(events).where(eq(events.id, otherEvent.id));
      restoreDefaultSession();
    }
  });
});
