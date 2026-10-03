import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import { events, user } from '@/db/schema';
import { getEligibleRsvpApplicants } from '@/lib/rsvp/eligible-rsvp-applicants';
import { selectRsvpWaveInvitees } from '@/lib/rsvp/select-rsvp-wave-invitees';
import type { ParticipationStatus } from '@/types/lookups';
import { insertParticipant, setStatus } from '@/tests/participation-fixtures';

let testEventId: string;
const userIdByStatus = new Map<ParticipationStatus, string>();
const createdUserIds: string[] = [];
const createdEventIds: string[] = [];

const ALL_STATUSES: ParticipationStatus[] = [
  'pending_review',
  'waitlisted',
  'denied',
  'invited',
  'accepted',
  'declined',
  'timed_out',
];

async function createUser(label: string): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({
      name: label,
      email: `eligible-${label}-${createdUserIds.length}@example.com`,
      emailVerified: true,
    })
    .returning({ id: user.id });
  createdUserIds.push(row.id);
  return row.id;
}

async function createEvent(capacity: number | null): Promise<string> {
  const [row] = await db
    .insert(events)
    .values({ name: 'Eligibility Test Event', hasApplication: true, capacity })
    .returning({ id: events.id });
  createdEventIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  testEventId = await createEvent(10);
  for (const status of ALL_STATUSES) {
    const userId = await createUser(status);
    userIdByStatus.set(status, userId);
    await insertParticipant({ eventId: testEventId, userId, status });
  }
});

afterAll(async () => {
  await db.delete(events).where(inArray(events.id, createdEventIds));
  await db.delete(user).where(inArray(user.id, createdUserIds));
});

describe('getEligibleRsvpApplicants', () => {
  test('returns null for a missing event', async () => {
    expect(
      await getEligibleRsvpApplicants('00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
  });

  test('includes only waitlisted participants', async () => {
    const result = await getEligibleRsvpApplicants(testEventId);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.applicants.map((a) => a.userId)).toEqual([
      userIdByStatus.get('waitlisted'),
    ]);

    // Capacity is measured against accepted participants only.
    expect(result.capacity).toBe(10);
    expect(result.attendeeCount).toBe(1);
    expect(result.availableSpots).toBe(9);
  });

  test('an invitation that times out never makes someone eligible again', async () => {
    const userId = userIdByStatus.get('waitlisted')!;
    await setStatus(testEventId, userId, 'timed_out');
    try {
      const result = await getEligibleRsvpApplicants(testEventId);
      expect(result?.applicants.map((a) => a.userId)).not.toContain(userId);
    } finally {
      await setStatus(testEventId, userId, 'waitlisted');
    }
  });

  test('reports zero available spots when capacity is full', async () => {
    const fullEventId = await createEvent(1);
    await insertParticipant({
      eventId: fullEventId,
      userId: await createUser('full-accepted'),
      status: 'accepted',
    });
    await insertParticipant({
      eventId: fullEventId,
      userId: await createUser('full-waitlisted'),
      status: 'waitlisted',
    });

    const result = await getEligibleRsvpApplicants(fullEventId);
    expect(result).toMatchObject({
      capacity: 1,
      attendeeCount: 1,
      availableSpots: 0,
    });
  });

  test('treats null capacity as unlimited', async () => {
    const openEventId = await createEvent(null);
    const result = await getEligibleRsvpApplicants(openEventId);
    expect(result?.capacity).toBeNull();
    expect(result?.availableSpots).toBeNull();
  });
});

describe('selectRsvpWaveInvitees', () => {
  const base = { email: 'x@example.com' };
  const at = (day: number) => new Date(Date.UTC(2026, 0, day));

  test('orders by waitlist position (unranked last), then application time', () => {
    const applicants = [
      {
        ...base,
        userId: 'unranked-late',
        participantId: 'p1',
        waitlistPosition: null,
        applicationCreatedAt: at(2),
      },
      {
        ...base,
        userId: 'unranked-early',
        participantId: 'p2',
        waitlistPosition: null,
        applicationCreatedAt: at(1),
      },
      {
        ...base,
        userId: 'w-2',
        participantId: 'p3',
        waitlistPosition: 2,
        applicationCreatedAt: at(3),
      },
      {
        ...base,
        userId: 'w-1',
        participantId: 'p4',
        waitlistPosition: 1,
        applicationCreatedAt: at(4),
      },
    ];

    expect(
      selectRsvpWaveInvitees(applicants, null).map((a) => a.userId),
    ).toEqual(['w-1', 'w-2', 'unranked-early', 'unranked-late']);
    expect(selectRsvpWaveInvitees(applicants, 3).map((a) => a.userId)).toEqual([
      'w-1',
      'w-2',
      'unranked-early',
    ]);
    expect(selectRsvpWaveInvitees(applicants, 0)).toEqual([]);
  });
});
