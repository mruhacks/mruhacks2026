import { describe, test, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';

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
import { getAdminRsvpSummary } from '@/lib/rsvp/get-admin-rsvp-summary';

let approvedStatusId: number;
let pendingRsvpStatusId: number;
let acceptedRsvpStatusId: number;
let declinedRsvpStatusId: number;
let timedOutRsvpStatusId: number;

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

async function ensureApprovedStatus(): Promise<number> {
  const [inserted] = await db
    .insert(applicationStatuses)
    .values({
      label: 'approved',
      title: 'Accepted',
      description: 'Accepted',
      variant: 'success',
      isFinal: true,
    })
    .onConflictDoNothing()
    .returning({ id: applicationStatuses.id });
  if (inserted) return inserted.id;
  const [existing] = await db
    .select({ id: applicationStatuses.id })
    .from(applicationStatuses)
    .where(eq(applicationStatuses.label, 'approved'))
    .limit(1);
  return existing.id;
}

async function createUser(name: string, email: string): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({ name, email, emailVerified: true })
    .returning({ id: user.id });
  return row.id;
}

beforeAll(async () => {
  approvedStatusId = await ensureApprovedStatus();
  pendingRsvpStatusId = await ensureRsvpStatus('pending', false);
  acceptedRsvpStatusId = await ensureRsvpStatus('accepted', true);
  declinedRsvpStatusId = await ensureRsvpStatus('declined', true);
  timedOutRsvpStatusId = await ensureRsvpStatus('timed_out', true);
});

describe('getAdminRsvpSummary', () => {
  test('returns a sensible empty state when no waves have been sent', async () => {
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'RSVP Summary Empty',
        hasApplication: true,
        capacity: 200,
      })
      .returning({ id: events.id });

    try {
      const summary = await getAdminRsvpSummary(eventRow.id);
      expect(summary?.lifecycle).toBe('no_waves');
      expect(summary?.latestWave).toBeNull();
      expect(summary?.previousWaves).toEqual([]);
      expect(summary?.capacity).toBe(200);
      expect(summary?.attendeeCount).toBe(0);
      expect(summary?.availableSpots).toBe(200);
    } finally {
      await db.delete(events).where(eq(events.id, eventRow.id));
    }
  });

  test('summarizes an active wave with derived counts and participants', async () => {
    const now = new Date('2026-09-16T18:00:00.000Z');
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'RSVP Summary Active',
        hasApplication: true,
        capacity: 10,
      })
      .returning({ id: events.id });

    const waitingId = await createUser(
      'Waiting Applicant',
      `rsvp-sum-wait-${eventRow.id}@example.com`,
    );
    const acceptedId = await createUser(
      'Accepted Applicant',
      `rsvp-sum-accept-${eventRow.id}@example.com`,
    );
    const declinedId = await createUser(
      'Declined Applicant',
      `rsvp-sum-decline-${eventRow.id}@example.com`,
    );

    await db.insert(eventApplications).values([
      {
        eventId: eventRow.id,
        userId: waitingId,
        statusId: approvedStatusId,
      },
      {
        eventId: eventRow.id,
        userId: acceptedId,
        statusId: approvedStatusId,
      },
      {
        eventId: eventRow.id,
        userId: declinedId,
        statusId: approvedStatusId,
      },
    ]);

    await db.insert(eventAttendees).values({
      eventId: eventRow.id,
      userId: acceptedId,
    });

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 4,
        createdAt: new Date('2026-09-16T14:00:00.000Z'),
        respondBy: new Date('2026-09-18T14:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values([
      {
        rsvpWaveId: wave.id,
        userId: waitingId,
        statusId: pendingRsvpStatusId,
      },
      {
        rsvpWaveId: wave.id,
        userId: acceptedId,
        statusId: acceptedRsvpStatusId,
        respondedAt: new Date('2026-09-16T15:00:00.000Z'),
      },
      {
        rsvpWaveId: wave.id,
        userId: declinedId,
        statusId: declinedRsvpStatusId,
        respondedAt: new Date('2026-09-16T15:30:00.000Z'),
      },
    ]);

    try {
      const summary = await getAdminRsvpSummary(eventRow.id, now);
      expect(summary?.lifecycle).toBe('active_wave');
      expect(summary?.attendeeCount).toBe(1);
      expect(summary?.capacity).toBe(10);
      expect(summary?.availableSpots).toBe(9);
      expect(summary?.latestWave?.wave).toBe(4);
      expect(summary?.latestWave?.isActive).toBe(true);
      expect(summary?.latestWave?.invitedCount).toBe(3);
      expect(summary?.latestWave?.acceptedCount).toBe(1);
      expect(summary?.latestWave?.declinedCount).toBe(1);
      expect(summary?.latestWave?.waitingCount).toBe(1);
      expect(summary?.latestWave?.timedOutCount).toBe(0);
      expect(
        summary?.latestWave?.participants.map((p) => p.statusLabel).sort(),
      ).toEqual(['accepted', 'declined', 'pending']);
    } finally {
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, waitingId));
      await db.delete(user).where(eq(user.id, acceptedId));
      await db.delete(user).where(eq(user.id, declinedId));
    }
  });

  test('treats expired pending rows as timed_out without a new status', async () => {
    const now = new Date('2026-09-18T15:00:00.000Z');
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'RSVP Summary Timeout',
        hasApplication: true,
        capacity: 5,
      })
      .returning({ id: events.id });

    const expiredId = await createUser(
      'Expired Applicant',
      `rsvp-sum-expired-${eventRow.id}@example.com`,
    );
    const persistedTimeoutId = await createUser(
      'Timed Out Applicant',
      `rsvp-sum-timeout-${eventRow.id}@example.com`,
    );

    await db.insert(eventApplications).values([
      {
        eventId: eventRow.id,
        userId: expiredId,
        statusId: approvedStatusId,
      },
      {
        eventId: eventRow.id,
        userId: persistedTimeoutId,
        statusId: approvedStatusId,
      },
    ]);

    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        createdAt: new Date('2026-09-16T14:00:00.000Z'),
        respondBy: new Date('2026-09-18T14:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values([
      {
        rsvpWaveId: wave.id,
        userId: expiredId,
        statusId: pendingRsvpStatusId,
      },
      {
        rsvpWaveId: wave.id,
        userId: persistedTimeoutId,
        statusId: timedOutRsvpStatusId,
      },
    ]);

    try {
      const summary = await getAdminRsvpSummary(eventRow.id, now);
      expect(summary?.latestWave?.waitingCount).toBe(0);
      expect(summary?.latestWave?.timedOutCount).toBe(2);
      expect(
        summary?.latestWave?.participants.every(
          (p) => p.statusLabel === 'timed_out',
        ),
      ).toBe(true);
    } finally {
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, expiredId));
      await db.delete(user).where(eq(user.id, persistedTimeoutId));
    }
  });

  test('includes previous-wave history with derived counts', async () => {
    const now = new Date('2026-09-20T18:00:00.000Z');
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'RSVP Summary History',
        hasApplication: true,
        capacity: 10,
      })
      .returning({ id: events.id });

    const firstId = await createUser(
      'Wave One',
      `rsvp-sum-w1-${eventRow.id}@example.com`,
    );
    const secondId = await createUser(
      'Wave Two',
      `rsvp-sum-w2-${eventRow.id}@example.com`,
    );

    await db.insert(eventApplications).values([
      {
        eventId: eventRow.id,
        userId: firstId,
        statusId: approvedStatusId,
      },
      {
        eventId: eventRow.id,
        userId: secondId,
        statusId: approvedStatusId,
      },
    ]);

    const [wave1] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 1,
        createdAt: new Date('2026-09-10T14:00:00.000Z'),
        respondBy: new Date('2026-09-12T14:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });
    const [wave2] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: eventRow.id,
        wave: 2,
        createdAt: new Date('2026-09-16T14:00:00.000Z'),
        respondBy: new Date('2026-09-22T14:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    await db.insert(eventRsvpResponses).values([
      {
        rsvpWaveId: wave1.id,
        userId: firstId,
        statusId: declinedRsvpStatusId,
        respondedAt: new Date('2026-09-11T12:00:00.000Z'),
      },
      {
        rsvpWaveId: wave2.id,
        userId: secondId,
        statusId: pendingRsvpStatusId,
      },
    ]);

    try {
      const summary = await getAdminRsvpSummary(eventRow.id, now);
      expect(summary?.latestWave?.wave).toBe(2);
      expect(summary?.previousWaves).toHaveLength(1);
      expect(summary?.previousWaves[0]?.wave).toBe(1);
      expect(summary?.previousWaves[0]?.invitedCount).toBe(1);
      expect(summary?.previousWaves[0]?.declinedCount).toBe(1);
      expect(summary?.previousWaves[0]?.acceptedCount).toBe(0);
    } finally {
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, firstId));
      await db.delete(user).where(eq(user.id, secondId));
    }
  });

  test('reports a full event using attendee occupancy', async () => {
    const now = new Date('2026-09-18T18:00:00.000Z');
    const [eventRow] = await db
      .insert(events)
      .values({
        name: 'RSVP Summary Full',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: events.id });

    const attendeeId = await createUser(
      'Full Attendee',
      `rsvp-sum-full-${eventRow.id}@example.com`,
    );

    await db.insert(eventApplications).values({
      eventId: eventRow.id,
      userId: attendeeId,
      statusId: approvedStatusId,
    });
    await db.insert(eventAttendees).values({
      eventId: eventRow.id,
      userId: attendeeId,
    });

    await db.insert(eventRsvpWaves).values({
      eventId: eventRow.id,
      wave: 1,
      createdAt: new Date('2026-09-16T14:00:00.000Z'),
      respondBy: new Date('2026-09-16T16:00:00.000Z'),
    });

    try {
      const summary = await getAdminRsvpSummary(eventRow.id, now);
      expect(summary?.attendeeCount).toBe(1);
      expect(summary?.capacity).toBe(1);
      expect(summary?.availableSpots).toBe(0);
      expect(summary?.lifecycle).toBe('event_full');
    } finally {
      await db.delete(events).where(eq(events.id, eventRow.id));
      await db.delete(user).where(eq(user.id, attendeeId));
    }
  });
});
