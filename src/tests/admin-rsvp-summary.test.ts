import { describe, test, expect, afterAll, vi } from 'vitest';
import { inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import { events, eventRsvpWaves, user } from '@/db/schema';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import { getEventSummaryCounts } from '@/lib/admin-event';
import { getAdminRsvpSummary } from '@/lib/rsvp/get-admin-rsvp-summary';
import type { ParticipationStatus } from '@/types/lookups';
import {
  insertInvitation,
  insertParticipant,
} from '@/tests/participation-fixtures';

const createdEventIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdEventIds.length) {
    await db.delete(events).where(inArray(events.id, createdEventIds));
  }
  if (createdUserIds.length) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }
});

async function createEvent(name: string, capacity: number | null = null) {
  const [row] = await db
    .insert(events)
    .values({ name, hasApplication: true, capacity })
    .returning({ id: events.id });
  createdEventIds.push(row.id);
  return row.id;
}

let userCounter = 0;
async function createUser(name: string): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({
      name,
      email: `rsvp-summary-${Date.now()}-${userCounter++}@example.com`,
      emailVerified: true,
    })
    .returning({ id: user.id });
  createdUserIds.push(row.id);
  return row.id;
}

async function createWave(
  eventId: string,
  wave: number,
  createdAt: Date,
  respondBy: Date,
) {
  const [row] = await db
    .insert(eventRsvpWaves)
    .values({ eventId, wave, createdAt, respondBy })
    .returning({ id: eventRsvpWaves.id });
  return row.id;
}

async function invite(
  eventId: string,
  waveId: string,
  status: Extract<
    ParticipationStatus,
    'invited' | 'accepted' | 'declined' | 'timed_out'
  >,
  respondedAt: Date | null = null,
  name = `${status} applicant`,
) {
  const userId = await createUser(name);
  await insertInvitation({
    rsvpWaveId: waveId,
    eventId,
    userId,
    status,
    respondedAt,
  });
  return userId;
}

describe('getEventSummaryCounts', () => {
  test('RSVP totals resolve expired invitations and sum across waves', async () => {
    const eventId = await createEvent('Dashboard RSVP Totals');
    const now = Date.now();
    const expiredWave = await createWave(
      eventId,
      1,
      new Date(now - 2 * 86_400_000),
      new Date(now - 86_400_000),
    );
    const activeWave = await createWave(
      eventId,
      2,
      new Date(now),
      new Date(now + 86_400_000),
    );

    for (const wave of [expiredWave, activeWave]) {
      for (const status of [
        'invited',
        'accepted',
        'declined',
        'timed_out',
      ] as const) {
        await invite(eventId, wave, status);
      }
    }

    const counts = await getEventSummaryCounts(eventId);
    // The expired wave's open invitation counts as timed out.
    expect(counts.rsvp).toEqual({
      accepted: 2,
      declined: 2,
      pending: 1,
      timedOut: 3,
    });
    expect(counts.applications).toBe(8);
    expect(counts.attendees).toBe(2);
  });
});

describe('getAdminRsvpSummary', () => {
  test('returns a sensible empty state when no waves have been sent', async () => {
    const eventId = await createEvent('RSVP Summary Empty', 200);
    const summary = await getAdminRsvpSummary(eventId);
    expect(summary).toMatchObject({
      lifecycle: 'no_waves',
      latestWave: null,
      previousWaves: [],
      capacity: 200,
      attendeeCount: 0,
      availableSpots: 200,
    });
  });

  test('summarizes an active wave with derived counts and participants', async () => {
    const now = new Date('2026-09-16T18:00:00.000Z');
    const eventId = await createEvent('RSVP Summary Active', 10);
    const wave = await createWave(
      eventId,
      4,
      new Date('2026-09-16T14:00:00.000Z'),
      new Date('2026-09-18T14:00:00.000Z'),
    );
    await invite(eventId, wave, 'invited');
    await invite(
      eventId,
      wave,
      'accepted',
      new Date('2026-09-16T15:00:00.000Z'),
    );
    await invite(
      eventId,
      wave,
      'declined',
      new Date('2026-09-16T15:30:00.000Z'),
    );

    const summary = await getAdminRsvpSummary(eventId, now);
    expect(summary?.lifecycle).toBe('active_wave');
    expect(summary?.attendeeCount).toBe(1);
    expect(summary?.availableSpots).toBe(9);
    expect(summary?.latestWave).toMatchObject({
      wave: 4,
      isActive: true,
      invitedCount: 3,
      acceptedCount: 1,
      declinedCount: 1,
      waitingCount: 1,
      timedOutCount: 0,
    });
    expect(
      summary?.latestWave?.participants.map((p) => p.statusLabel).sort(),
    ).toEqual(['accepted', 'declined', 'invited']);
  });

  test('treats expired open invitations as timed_out', async () => {
    const now = new Date('2026-09-18T15:00:00.000Z');
    const eventId = await createEvent('RSVP Summary Timeout', 5);
    const wave = await createWave(
      eventId,
      1,
      new Date('2026-09-16T14:00:00.000Z'),
      new Date('2026-09-18T14:00:00.000Z'),
    );
    await invite(eventId, wave, 'invited');
    await invite(eventId, wave, 'timed_out');

    const summary = await getAdminRsvpSummary(eventId, now);
    expect(summary?.latestWave?.waitingCount).toBe(0);
    expect(summary?.latestWave?.timedOutCount).toBe(2);
    expect(
      summary?.latestWave?.participants.every(
        (p) => p.statusLabel === 'timed_out',
      ),
    ).toBe(true);
  });

  test('includes previous-wave history with derived counts', async () => {
    const now = new Date('2026-09-20T18:00:00.000Z');
    const eventId = await createEvent('RSVP Summary History', 10);
    const wave1 = await createWave(
      eventId,
      1,
      new Date('2026-09-10T14:00:00.000Z'),
      new Date('2026-09-12T14:00:00.000Z'),
    );
    const wave2 = await createWave(
      eventId,
      2,
      new Date('2026-09-16T14:00:00.000Z'),
      new Date('2026-09-22T14:00:00.000Z'),
    );
    await invite(
      eventId,
      wave1,
      'declined',
      new Date('2026-09-11T12:00:00.000Z'),
    );
    await invite(eventId, wave2, 'invited');

    const summary = await getAdminRsvpSummary(eventId, now);
    expect(summary?.latestWave?.wave).toBe(2);
    expect(summary?.previousWaves).toHaveLength(1);
    expect(summary?.previousWaves[0]).toMatchObject({
      wave: 1,
      invitedCount: 1,
      declinedCount: 1,
      acceptedCount: 0,
    });
  });

  test('reports a full event using accepted participants', async () => {
    const now = new Date('2026-09-18T18:00:00.000Z');
    const eventId = await createEvent('RSVP Summary Full', 1);
    await insertParticipant({
      eventId,
      userId: await createUser('Full Attendee'),
      status: 'accepted',
    });
    await createWave(
      eventId,
      1,
      new Date('2026-09-16T14:00:00.000Z'),
      new Date('2026-09-16T16:00:00.000Z'),
    );

    const summary = await getAdminRsvpSummary(eventId, now);
    expect(summary).toMatchObject({
      attendeeCount: 1,
      capacity: 1,
      availableSpots: 0,
      lifecycle: 'event_full',
    });
  });
});
