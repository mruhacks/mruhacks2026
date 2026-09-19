import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';
import { count, eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  applicationStatuses,
  eventApplications,
  eventAttendees,
  eventRsvpResponses,
  eventRsvpWaves,
  events,
  rsvpStatuses,
  user,
} from '@/db/schema';
import { runScheduledRsvpWaves } from '@/lib/rsvp/run-scheduled-rsvp-waves';

const { publishRsvpInvitation } = vi.hoisted(() => ({
  publishRsvpInvitation: vi.fn(),
}));
vi.mock('@/lib/rsvp/rsvp-invitation-queue', () => ({
  publishRsvpInvitation,
}));

let approvedStatusId: number;
let pendingRsvpStatusId: number;
let declinedRsvpStatusId: number;
let timedOutRsvpStatusId: number;

async function ensureApplicationStatus(label: string): Promise<number> {
  const [inserted] = await db
    .insert(applicationStatuses)
    .values({
      label,
      title: label,
      description: label,
      variant: 'default',
      isFinal: label === 'approved',
    })
    .onConflictDoNothing()
    .returning({ id: applicationStatuses.id });
  if (inserted) return inserted.id;
  const [existing] = await db
    .select({ id: applicationStatuses.id })
    .from(applicationStatuses)
    .where(eq(applicationStatuses.label, label))
    .limit(1);
  return existing.id;
}

async function ensureRsvpStatus(
  label: string,
  isFinal: boolean,
): Promise<number> {
  const [inserted] = await db
    .insert(rsvpStatuses)
    .values({
      label,
      title: label,
      description: label,
      variant: 'default',
      isFinal,
    })
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

async function insertApprovedUser(
  eventId: string,
  email: string,
  createdAt?: Date,
): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({
      name: email,
      email,
      emailVerified: true,
    })
    .returning({ id: user.id });
  await db.insert(eventApplications).values({
    eventId,
    userId: row.id,
    statusId: approvedStatusId,
    ...(createdAt ? { createdAt } : {}),
  });
  return row.id;
}

async function waveCount(eventId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, eventId));
  return Number(value);
}

beforeAll(async () => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  approvedStatusId = await ensureApplicationStatus('approved');
  pendingRsvpStatusId = await ensureRsvpStatus('pending', false);
  declinedRsvpStatusId = await ensureRsvpStatus('declined', true);
  timedOutRsvpStatusId = await ensureRsvpStatus('timed_out', true);
});

beforeEach(() => {
  publishRsvpInvitation.mockReset();
  publishRsvpInvitation.mockResolvedValue({ messageId: 'msg-id' });
});

describe('runScheduledRsvpWaves', () => {
  test('skips events with no prior admin wave', async () => {
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled No Prior Wave',
        hasApplication: true,
      })
      .returning({ id: events.id, name: events.name });

    try {
      const result = await runScheduledRsvpWaves({
        now: new Date('2026-08-10T00:00:00.000Z'),
      });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_no_prior_wave');
    } finally {
      await db.delete(events).where(eq(events.id, eventRow.id));
    }
  });

  test('does not start a replacement wave while the latest wave is still active', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Active Wave Event',
        hasApplication: true,
        capacity: 10,
      })
      .returning({ id: events.id });

    const pendingUserId = await insertApprovedUser(
      eventRow.id,
      'scheduled-active-pending@example.com',
    );
    const waitingUserId = await insertApprovedUser(
      eventRow.id,
      'scheduled-active-waiting@example.com',
    );

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        respondBy: new Date('2026-08-12T12:00:00.000Z'),
        createdAt: new Date('2026-08-10T12:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: wave.id,
      userId: pendingUserId,
      statusId: pendingRsvpStatusId,
    });

    try {
      const result = await runScheduledRsvpWaves({ now });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_active_wave');
      expect(await waveCount(eventRow.id)).toBe(1);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, pendingUserId));
      await db.delete(user).where(eq(user.id, waitingUserId));
    }
  });

  test('does not replace an early decline before the current wave expires', async () => {
    const now = new Date('2026-08-10T14:00:00.000Z');
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Early Decline Event',
        hasApplication: true,
        capacity: 2,
      })
      .returning({ id: events.id });

    const declinedUserId = await insertApprovedUser(
      eventRow.id,
      'scheduled-early-decline@example.com',
    );
    const waitingUserId = await insertApprovedUser(
      eventRow.id,
      'scheduled-early-waiting@example.com',
    );

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        respondBy: new Date('2026-08-12T12:00:00.000Z'),
        createdAt: new Date('2026-08-10T12:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: wave.id,
      userId: declinedUserId,
      statusId: declinedRsvpStatusId,
      respondedAt: new Date('2026-08-10T14:00:00.000Z'),
    });

    try {
      const result = await runScheduledRsvpWaves({ now });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_active_wave');
      expect(await waveCount(eventRow.id)).toBe(1);
      expect(publishRsvpInvitation).not.toHaveBeenCalled();
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, declinedUserId));
      await db.delete(user).where(eq(user.id, waitingUserId));
    }
  });

  test('timeouts expired pending RSVPs and sends a follow-up wave', async () => {
    const now = new Date();
    const priorCreatedAt = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    const priorRespondBy = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Follow-up Event',
        hasApplication: true,
        capacity: 10,
      })
      .returning({ id: events.id });

    const expiredUserId = await insertApprovedUser(
      eventRow.id,
      'scheduled-rsvp@example.com',
    );
    const nextUserId = await insertApprovedUser(
      eventRow.id,
      'scheduled-rsvp-next@example.com',
      new Date('2026-07-01T00:00:00.000Z'),
    );

    const [priorWave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        respondBy: priorRespondBy,
        createdAt: priorCreatedAt,
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: priorWave.id,
      userId: expiredUserId,
      statusId: pendingRsvpStatusId,
    });

    try {
      const first = await runScheduledRsvpWaves({ now });
      const firstMatch = first.results.find((r) => r.eventId === eventRow.id);
      expect(first.timedOutCount).toBeGreaterThanOrEqual(1);
      expect(firstMatch?.action).toBe('sent');
      expect(firstMatch?.waveNumber).toBe(2);
      expect(firstMatch?.responsesCreated).toBe(1);
      expect(firstMatch?.invitationsQueued).toBe(1);

      const [expiredRow] = await db
        .select({ statusId: eventRsvpResponses.statusId })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.userId, expiredUserId));
      expect(expiredRow?.statusId).toBe(timedOutRsvpStatusId);

      expect(await waveCount(eventRow.id)).toBe(2);

      const second = await runScheduledRsvpWaves({ now });
      const secondMatch = second.results.find((r) => r.eventId === eventRow.id);
      expect(secondMatch?.action).toBe('skipped_active_wave');
      expect(await waveCount(eventRow.id)).toBe(2);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, expiredUserId));
      await db.delete(user).where(eq(user.id, nextUserId));
    }
  });

  test('skips when capacity is full after the previous wave expires', async () => {
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Full Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: events.id });

    const attendeeId = await insertApprovedUser(
      eventRow.id,
      'scheduled-full-attendee@example.com',
    );
    const eligibleId = await insertApprovedUser(
      eventRow.id,
      'scheduled-full-eligible@example.com',
    );

    await db.insert(eventAttendees).values({
      eventId: eventRow.id,
      userId: attendeeId,
    });
    await db.insert(eventRsvpWaves).values({
      eventId: eventRow.id,
      wave: 1,
      respondBy: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-06T00:00:00.000Z'),
    });

    try {
      const result = await runScheduledRsvpWaves({
        now: new Date('2026-08-10T00:00:00.000Z'),
      });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_no_capacity');
      expect(await waveCount(eventRow.id)).toBe(1);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventAttendees)
        .where(eq(eventAttendees.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, attendeeId));
      await db.delete(user).where(eq(user.id, eligibleId));
    }
  });

  test('invites the earliest applicants up to remaining capacity on the next wave', async () => {
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Overflow Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: events.id });

    const userAId = await insertApprovedUser(
      eventRow.id,
      'scheduled-overflow-a@example.com',
      new Date('2026-07-01T00:00:00.000Z'),
    );
    const userBId = await insertApprovedUser(
      eventRow.id,
      'scheduled-overflow-b@example.com',
      new Date('2026-07-02T00:00:00.000Z'),
    );

    await db.insert(eventRsvpWaves).values({
      eventId: eventRow.id,
      wave: 1,
      respondBy: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-06T00:00:00.000Z'),
    });

    try {
      const result = await runScheduledRsvpWaves({
        now: new Date('2026-08-10T00:00:00.000Z'),
      });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('sent');
      expect(match?.eligibleApplicantCount).toBe(2);
      expect(match?.responsesCreated).toBe(1);

      const invited = await db
        .select({ userId: eventRsvpResponses.userId })
        .from(eventRsvpResponses)
        .innerJoin(
          eventRsvpWaves,
          eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
        )
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      expect(invited.map((row) => row.userId)).toContain(userAId);
      expect(invited.map((row) => row.userId)).not.toContain(userBId);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, userAId));
      await db.delete(user).where(eq(user.id, userBId));
    }
  });

  test('does not create a wave when nobody remains eligible after expiry', async () => {
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Empty Eligible',
        hasApplication: true,
        capacity: 5,
      })
      .returning({ id: events.id });

    const applicantId = await insertApprovedUser(
      eventRow.id,
      'scheduled-still-pending@example.com',
    );

    const [priorWave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        respondBy: new Date('2026-08-08T00:00:00.000Z'),
        createdAt: new Date('2026-08-06T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: priorWave.id,
      userId: applicantId,
      statusId: pendingRsvpStatusId,
    });

    try {
      const result = await runScheduledRsvpWaves({
        now: new Date('2026-08-10T00:00:00.000Z'),
      });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_no_eligible');
      expect(await waveCount(eventRow.id)).toBe(1);

      const [expiredRow] = await db
        .select({ statusId: eventRsvpResponses.statusId })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.userId, applicantId));
      expect(expiredRow?.statusId).toBe(timedOutRsvpStatusId);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, applicantId));
    }
  });

  test('does not create a wave after the event has started', async () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Started Event',
        hasApplication: true,
        startsAt: new Date('2026-08-09T00:00:00.000Z'),
      })
      .returning({ id: events.id });

    const applicantId = await insertApprovedUser(
      eventRow.id,
      'scheduled-started@example.com',
    );

    await db.insert(eventRsvpWaves).values({
      eventId: eventRow.id,
      wave: 1,
      respondBy: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-06T00:00:00.000Z'),
    });

    try {
      const result = await runScheduledRsvpWaves({ now });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_event_started');
      expect(await waveCount(eventRow.id)).toBe(1);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, applicantId));
    }
  });

  test('concurrent scheduled runs create only one next wave', async () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Concurrent Event',
        hasApplication: true,
        capacity: 10,
      })
      .returning({ id: events.id });

    const applicantId = await insertApprovedUser(
      eventRow.id,
      'scheduled-concurrent@example.com',
    );

    await db.insert(eventRsvpWaves).values({
      eventId: eventRow.id,
      wave: 1,
      respondBy: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-06T00:00:00.000Z'),
    });

    try {
      const [first, second] = await Promise.all([
        runScheduledRsvpWaves({ now }),
        runScheduledRsvpWaves({ now }),
      ]);
      const actions = [first, second].map(
        (run) => run.results.find((r) => r.eventId === eventRow.id)?.action,
      );
      expect(actions).toContain('sent');
      expect(actions.filter((action) => action === 'sent')).toHaveLength(1);
      expect(await waveCount(eventRow.id)).toBe(2);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, applicantId));
    }
  });
});
