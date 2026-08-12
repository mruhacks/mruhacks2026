import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
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
import {
  computeScheduledRespondBy,
  runScheduledRsvpWaves,
} from '@/lib/rsvp/run-scheduled-rsvp-waves';

vi.mock('@/utils/mail', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { sendMail } from '@/utils/mail';

let approvedStatusId: number;
let pendingRsvpStatusId: number;

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

beforeAll(async () => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  approvedStatusId = await ensureApplicationStatus('approved');
  pendingRsvpStatusId = await ensureRsvpStatus('pending', false);
  await ensureRsvpStatus('timed_out', true);
});

describe('computeScheduledRespondBy', () => {
  test('reuses the previous wave invitation window', () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const respondBy = computeScheduledRespondBy(
      {
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        respondBy: new Date('2026-08-03T00:00:00.000Z'),
      },
      now,
    );
    expect(respondBy).toEqual(new Date('2026-08-12T00:00:00.000Z'));
  });

  test('falls back to 48 hours when prior window is missing', () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const respondBy = computeScheduledRespondBy(
      {
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        respondBy: null,
      },
      now,
    );
    expect(respondBy).toEqual(new Date('2026-08-12T00:00:00.000Z'));
  });
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
      const now = new Date('2026-08-10T00:00:00.000Z');
      const result = await runScheduledRsvpWaves({ now });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_no_prior_wave');
    } finally {
      await db.delete(events).where(eq(events.id, eventRow.id));
    }
  });

  test('timeouts expired RSVPs, sends a follow-up wave, and is idempotent the same day', async () => {
    // Relative dates: sendRsvpWave checks respondBy against Date.now().
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

    const [applicant] = await db
      .insert(user)
      .values({
        name: 'Scheduled Applicant',
        email: 'scheduled-rsvp@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    await db.insert(eventApplications).values({
      eventId: eventRow.id,
      userId: applicant.id,
      statusId: approvedStatusId,
    });

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
      userId: applicant.id,
      statusId: pendingRsvpStatusId,
    });

    vi.mocked(sendMail).mockClear();

    try {
      const first = await runScheduledRsvpWaves({ now });
      const firstMatch = first.results.find((r) => r.eventId === eventRow.id);
      expect(first.timedOutCount).toBeGreaterThanOrEqual(1);
      expect(firstMatch?.action).toBe('sent');
      expect(firstMatch?.waveNumber).toBe(2);
      expect(firstMatch?.responsesCreated).toBe(1);
      expect(firstMatch?.emailsSent).toBe(1);

      const [{ value: waveCount }] = await db
        .select({ value: count() })
        .from(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      expect(Number(waveCount)).toBe(2);

      // Second run should not create another wave (pending clears eligibility).
      const second = await runScheduledRsvpWaves({ now });
      const secondMatch = second.results.find((r) => r.eventId === eventRow.id);
      expect(['skipped_already_ran_today', 'skipped_no_eligible']).toContain(
        secondMatch?.action,
      );

      const [{ value: waveCountAfter }] = await db
        .select({ value: count() })
        .from(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      expect(Number(waveCountAfter)).toBe(2);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, applicant.id));
    }
  });

  test('skips when a wave was already created earlier the same UTC day', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Same Day Event',
        hasApplication: true,
        capacity: 10,
      })
      .returning({ id: events.id });

    const [applicant] = await db
      .insert(user)
      .values({
        name: 'Same Day Applicant',
        email: 'scheduled-same-day@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    await db.insert(eventApplications).values({
      eventId: eventRow.id,
      userId: applicant.id,
      statusId: approvedStatusId,
    });

    await db.insert(eventRsvpWaves).values({
      eventId: eventRow.id,
      wave: 1,
      respondBy: new Date('2026-08-12T00:00:00.000Z'),
      createdAt: new Date('2026-08-10T00:30:00.000Z'),
    });

    try {
      const result = await runScheduledRsvpWaves({ now });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_already_ran_today');
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, applicant.id));
    }
  });

  test('skips when capacity is full', async () => {
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Full Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: events.id });

    const [attendee] = await db
      .insert(user)
      .values({
        name: 'Full Attendee',
        email: 'scheduled-full-attendee@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    const [eligible] = await db
      .insert(user)
      .values({
        name: 'Full Eligible',
        email: 'scheduled-full-eligible@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    await db.insert(eventApplications).values([
      {
        eventId: eventRow.id,
        userId: attendee.id,
        statusId: approvedStatusId,
      },
      {
        eventId: eventRow.id,
        userId: eligible.id,
        statusId: approvedStatusId,
      },
    ]);
    await db.insert(eventAttendees).values({
      eventId: eventRow.id,
      userId: attendee.id,
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
      await db.delete(user).where(eq(user.id, attendee.id));
      await db.delete(user).where(eq(user.id, eligible.id));
    }
  });

  test('skips when eligible applicants exceed remaining spots (no ranking)', async () => {
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Overflow Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: events.id });

    const [userA] = await db
      .insert(user)
      .values({
        name: 'Overflow A',
        email: 'scheduled-overflow-a@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    const [userB] = await db
      .insert(user)
      .values({
        name: 'Overflow B',
        email: 'scheduled-overflow-b@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    await db.insert(eventApplications).values([
      {
        eventId: eventRow.id,
        userId: userA.id,
        statusId: approvedStatusId,
      },
      {
        eventId: eventRow.id,
        userId: userB.id,
        statusId: approvedStatusId,
      },
    ]);
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
      expect(match?.action).toBe('skipped_exceeds_capacity');
      expect(match?.detail).toMatch(/no ranking/i);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, userA.id));
      await db.delete(user).where(eq(user.id, userB.id));
    }
  });

  test('does not create a wave when there are no eligible applicants', async () => {
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'Scheduled Empty Eligible',
        hasApplication: true,
        capacity: 5,
      })
      .returning({ id: events.id });

    const [applicant] = await db
      .insert(user)
      .values({
        name: 'Still Pending',
        email: 'scheduled-still-pending@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    await db.insert(eventApplications).values({
      eventId: eventRow.id,
      userId: applicant.id,
      statusId: approvedStatusId,
    });

    const [priorWave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        respondBy: new Date('2099-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-06T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values({
      rsvpWaveId: priorWave.id,
      userId: applicant.id,
      statusId: pendingRsvpStatusId,
    });

    try {
      const result = await runScheduledRsvpWaves({
        now: new Date('2026-08-10T00:00:00.000Z'),
      });
      const match = result.results.find((r) => r.eventId === eventRow.id);
      expect(match?.action).toBe('skipped_no_eligible');

      const [{ value: waveCount }] = await db
        .select({ value: count() })
        .from(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      expect(Number(waveCount)).toBe(1);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventRow.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventRow.id));
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, applicant.id));
    }
  });
});
