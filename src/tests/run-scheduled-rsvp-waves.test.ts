import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';
import { count, eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import * as Rsvp from '@/lib/rsvp/server';
import { getStatus, insertInvitation, insertParticipant, setStatus } from '@/tests/participation-fixtures';

const { publishRsvpInvitation } = vi.hoisted(() => ({
  publishRsvpInvitation: vi.fn(),
}));
vi.mock('@/lib/rsvp/rsvp-invitation-queue', () => ({
  publishRsvpInvitation,
}));

async function insertWaitlistedUser(eventId: string, email: string, createdAt?: Date): Promise<string> {
  const [row] = await db
    .insert(schema.user)
    .values({
      name: email,
      email,
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  await insertParticipant({
    eventId,
    userId: row.id,
    status: 'waitlisted',
    createdAt,
  });
  return row.id;
}

async function waveCount(eventId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(schema.eventRsvpWaves)
    .where(eq(schema.eventRsvpWaves.eventId, eventId));
  return Number(value);
}

beforeAll(async () => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
});

beforeEach(() => {
  publishRsvpInvitation.mockReset();
  publishRsvpInvitation.mockResolvedValue({ messageId: 'msg-id' });
});

describe('runScheduledRsvpWaves', () => {
  test('skips events with no prior admin wave', async () => {
    const [eventRow] = await db
      .insert(schema.events)
      .values({
        name: 'Scheduled No Prior Wave',
        hasApplication: true,
      })
      .returning({ id: schema.events.id, name: schema.events.name });

    try {
      const result = await Rsvp.runScheduledRsvpWaves({
        now: new Date('2026-08-10T00:00:00.000Z'),
      });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_no_prior_wave');
    } finally {
      await db.delete(schema.events).where(eq(schema.events.id, eventRow.id));
    }
  });

  test('does not start a replacement wave while the latest wave is still active', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const [eventRow] = await db
      .insert(schema.events)
      .values({
        name: 'Scheduled Active Wave Event',
        hasApplication: true,
        capacity: 10,
      })
      .returning({ id: schema.events.id });

    const pendingUserId = await insertWaitlistedUser(eventRow.id, 'scheduled-active-pending@example.com');
    const waitingUserId = await insertWaitlistedUser(eventRow.id, 'scheduled-active-waiting@example.com');

    const [wave] = await db
      .insert(schema.eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        respondBy: new Date('2026-08-12T12:00:00.000Z'),
        createdAt: new Date('2026-08-10T12:00:00.000Z'),
      })
      .returning({ id: schema.eventRsvpWaves.id });

    await insertInvitation({
      rsvpWaveId: wave.id,
      eventId: eventRow.id,
      userId: pendingUserId,
      status: 'invited',
    });

    try {
      const result = await Rsvp.runScheduledRsvpWaves({ now });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_active_wave');
      expect(await waveCount(eventRow.id)).toBe(1);
    } finally {
      await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.eventId, eventRow.id));
      await db.delete(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventRow.id));
      await db.delete(schema.events).where(eq(schema.events.id, eventRow.id));
      await db.delete(schema.user).where(eq(schema.user.id, pendingUserId));
      await db.delete(schema.user).where(eq(schema.user.id, waitingUserId));
    }
  });

  test('does not replace an early decline before the current wave expires', async () => {
    const now = new Date('2026-08-10T14:00:00.000Z');
    const [eventRow] = await db
      .insert(schema.events)
      .values({
        name: 'Scheduled Early Decline Event',
        hasApplication: true,
        capacity: 2,
      })
      .returning({ id: schema.events.id });

    const declinedUserId = await insertWaitlistedUser(eventRow.id, 'scheduled-early-decline@example.com');
    const waitingUserId = await insertWaitlistedUser(eventRow.id, 'scheduled-early-waiting@example.com');

    const [wave] = await db
      .insert(schema.eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        respondBy: new Date('2026-08-12T12:00:00.000Z'),
        createdAt: new Date('2026-08-10T12:00:00.000Z'),
      })
      .returning({ id: schema.eventRsvpWaves.id });

    await insertInvitation({
      rsvpWaveId: wave.id,
      eventId: eventRow.id,
      userId: declinedUserId,
      status: 'declined',
      respondedAt: new Date('2026-08-10T14:00:00.000Z'),
    });

    try {
      const result = await Rsvp.runScheduledRsvpWaves({ now });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_active_wave');
      expect(await waveCount(eventRow.id)).toBe(1);
      expect(publishRsvpInvitation).not.toHaveBeenCalled();
    } finally {
      await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.eventId, eventRow.id));
      await db.delete(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventRow.id));
      await db.delete(schema.events).where(eq(schema.events.id, eventRow.id));
      await db.delete(schema.user).where(eq(schema.user.id, declinedUserId));
      await db.delete(schema.user).where(eq(schema.user.id, waitingUserId));
    }
  });

  test('timeouts expired pending RSVPs and sends a follow-up wave', async () => {
    const now = new Date();
    const priorCreatedAt = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    const priorRespondBy = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const [eventRow] = await db
      .insert(schema.events)
      .values({
        name: 'Scheduled Follow-up Event',
        hasApplication: true,
        capacity: 10,
      })
      .returning({ id: schema.events.id });

    const expiredUserId = await insertWaitlistedUser(eventRow.id, 'scheduled-rsvp@example.com');
    const nextUserId = await insertWaitlistedUser(
      eventRow.id,
      'scheduled-rsvp-next@example.com',
      new Date('2026-07-01T00:00:00.000Z'),
    );

    const [priorWave] = await db
      .insert(schema.eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        respondBy: priorRespondBy,
        createdAt: priorCreatedAt,
      })
      .returning({ id: schema.eventRsvpWaves.id });

    await insertInvitation({
      rsvpWaveId: priorWave.id,
      eventId: eventRow.id,
      userId: expiredUserId,
      status: 'invited',
    });

    try {
      const first = await Rsvp.runScheduledRsvpWaves({ now });
      const firstMatch = first.results.find((r) => r.eventId === eventRow.id);
      expect(first.timedOutCount).toBeGreaterThanOrEqual(1);
      expect(firstMatch?.action).toBe('sent');
      expect(firstMatch?.waveNumber).toBe(2);
      expect(firstMatch?.responsesCreated).toBe(1);
      expect(firstMatch?.invitationsQueued).toBe(1);

      expect(await getStatus(eventRow.id, expiredUserId)).toBe('timed_out');

      expect(await waveCount(eventRow.id)).toBe(2);

      const second = await Rsvp.runScheduledRsvpWaves({ now });
      const secondMatch = second.results.find((r) => r.eventId === eventRow.id);
      expect(secondMatch?.action).toBe('skipped_active_wave');
      expect(await waveCount(eventRow.id)).toBe(2);
    } finally {
      await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.eventId, eventRow.id));
      await db.delete(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventRow.id));
      await db.delete(schema.events).where(eq(schema.events.id, eventRow.id));
      await db.delete(schema.user).where(eq(schema.user.id, expiredUserId));
      await db.delete(schema.user).where(eq(schema.user.id, nextUserId));
    }
  });

  test('skips when capacity is full after the previous wave expires', async () => {
    const [eventRow] = await db
      .insert(schema.events)
      .values({
        name: 'Scheduled Full Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: schema.events.id });

    const attendeeId = await insertWaitlistedUser(eventRow.id, 'scheduled-full-attendee@example.com');
    const eligibleId = await insertWaitlistedUser(eventRow.id, 'scheduled-full-eligible@example.com');

    await setStatus(eventRow.id, attendeeId, 'accepted');
    await db.insert(schema.eventRsvpWaves).values({
      eventId: eventRow.id,
      wave: 1,
      respondBy: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-06T00:00:00.000Z'),
    });

    try {
      const result = await Rsvp.runScheduledRsvpWaves({
        now: new Date('2026-08-10T00:00:00.000Z'),
      });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_no_capacity');
      expect(await waveCount(eventRow.id)).toBe(1);
    } finally {
      await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.eventId, eventRow.id));
      await db.delete(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventRow.id));
      await db.delete(schema.events).where(eq(schema.events.id, eventRow.id));
      await db.delete(schema.user).where(eq(schema.user.id, attendeeId));
      await db.delete(schema.user).where(eq(schema.user.id, eligibleId));
    }
  });

  test('invites the earliest applicants up to remaining capacity on the next wave', async () => {
    const [eventRow] = await db
      .insert(schema.events)
      .values({
        name: 'Scheduled Overflow Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: schema.events.id });

    const userAId = await insertWaitlistedUser(
      eventRow.id,
      'scheduled-overflow-a@example.com',
      new Date('2026-07-01T00:00:00.000Z'),
    );
    const userBId = await insertWaitlistedUser(
      eventRow.id,
      'scheduled-overflow-b@example.com',
      new Date('2026-07-02T00:00:00.000Z'),
    );

    await db.insert(schema.eventRsvpWaves).values({
      eventId: eventRow.id,
      wave: 1,
      respondBy: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-06T00:00:00.000Z'),
    });

    try {
      const result = await Rsvp.runScheduledRsvpWaves({
        now: new Date('2026-08-10T00:00:00.000Z'),
      });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('sent');
      expect(match?.eligibleApplicantCount).toBe(2);
      expect(match?.responsesCreated).toBe(1);

      const invited = await db
        .select({ userId: schema.eventParticipants.userId })
        .from(schema.eventInvitations)
        .innerJoin(schema.eventParticipants, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
        .where(eq(schema.eventParticipants.eventId, eventRow.id));
      expect(invited.map((row) => row.userId)).toContain(userAId);
      expect(invited.map((row) => row.userId)).not.toContain(userBId);
    } finally {
      await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.eventId, eventRow.id));
      await db.delete(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventRow.id));
      await db.delete(schema.events).where(eq(schema.events.id, eventRow.id));
      await db.delete(schema.user).where(eq(schema.user.id, userAId));
      await db.delete(schema.user).where(eq(schema.user.id, userBId));
    }
  });

  test('does not create a wave when nobody remains eligible after expiry', async () => {
    const [eventRow] = await db
      .insert(schema.events)
      .values({
        name: 'Scheduled Empty Eligible',
        hasApplication: true,
        capacity: 5,
      })
      .returning({ id: schema.events.id });

    const applicantId = await insertWaitlistedUser(eventRow.id, 'scheduled-still-pending@example.com');

    const [priorWave] = await db
      .insert(schema.eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        respondBy: new Date('2026-08-08T00:00:00.000Z'),
        createdAt: new Date('2026-08-06T00:00:00.000Z'),
      })
      .returning({ id: schema.eventRsvpWaves.id });

    await insertInvitation({
      rsvpWaveId: priorWave.id,
      eventId: eventRow.id,
      userId: applicantId,
      status: 'invited',
    });

    try {
      const result = await Rsvp.runScheduledRsvpWaves({
        now: new Date('2026-08-10T00:00:00.000Z'),
      });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_no_eligible');
      expect(await waveCount(eventRow.id)).toBe(1);

      expect(await getStatus(eventRow.id, applicantId)).toBe('timed_out');
    } finally {
      await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.eventId, eventRow.id));
      await db.delete(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventRow.id));
      await db.delete(schema.events).where(eq(schema.events.id, eventRow.id));
      await db.delete(schema.user).where(eq(schema.user.id, applicantId));
    }
  });

  test('does not create a wave after the event has started', async () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const [eventRow] = await db
      .insert(schema.events)
      .values({
        name: 'Scheduled Started Event',
        hasApplication: true,
        startsAt: new Date('2026-08-09T00:00:00.000Z'),
      })
      .returning({ id: schema.events.id });

    const applicantId = await insertWaitlistedUser(eventRow.id, 'scheduled-started@example.com');

    await db.insert(schema.eventRsvpWaves).values({
      eventId: eventRow.id,
      wave: 1,
      respondBy: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-06T00:00:00.000Z'),
    });

    try {
      const result = await Rsvp.runScheduledRsvpWaves({ now });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_event_started');
      expect(await waveCount(eventRow.id)).toBe(1);
    } finally {
      await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.eventId, eventRow.id));
      await db.delete(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventRow.id));
      await db.delete(schema.events).where(eq(schema.events.id, eventRow.id));
      await db.delete(schema.user).where(eq(schema.user.id, applicantId));
    }
  });

  test('concurrent scheduled runs create only one next wave', async () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const [eventRow] = await db
      .insert(schema.events)
      .values({
        name: 'Scheduled Concurrent Event',
        hasApplication: true,
        capacity: 10,
      })
      .returning({ id: schema.events.id });

    const applicantId = await insertWaitlistedUser(eventRow.id, 'scheduled-concurrent@example.com');

    await db.insert(schema.eventRsvpWaves).values({
      eventId: eventRow.id,
      wave: 1,
      respondBy: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-06T00:00:00.000Z'),
    });

    try {
      const [first, second] = await Promise.all([
        Rsvp.runScheduledRsvpWaves({ now }),
        Rsvp.runScheduledRsvpWaves({ now }),
      ]);
      const actions = [first, second].map((run) => run.results.find((r) => r.eventId === eventRow.id)?.action);
      expect(actions).toContain('sent');
      expect(actions.filter((action) => action === 'sent')).toHaveLength(1);
      expect(await waveCount(eventRow.id)).toBe(2);
    } finally {
      await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.eventId, eventRow.id));
      await db.delete(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventRow.id));
      await db.delete(schema.events).where(eq(schema.events.id, eventRow.id));
      await db.delete(schema.user).where(eq(schema.user.id, applicantId));
    }
  });
});
