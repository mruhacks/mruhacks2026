import { describe, test, expect, beforeAll, afterAll } from 'vitest';
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
import { getEligibleRsvpApplicants } from '@/lib/rsvp/eligible-rsvp-applicants';

let approvedStatusId: number;
let pendingReviewStatusId: number;
let pendingRsvpStatusId: number;
let acceptedRsvpStatusId: number;
let declinedRsvpStatusId: number;
let timedOutRsvpStatusId: number;
let testEventId: string;
let neverInvitedUserId: string;
let pendingUserId: string;
let acceptedUserId: string;
let declinedUserId: string;
let timedOutUserId: string;
let attendeeUserId: string;
let pendingReviewUserId: string;

async function ensureRsvpStatus(
  label: string,
  title: string,
  isFinal: boolean,
): Promise<number> {
  const [inserted] = await db
    .insert(rsvpStatuses)
    .values({
      label,
      title,
      description: title,
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

async function ensureApplicationStatus(
  label: string,
  title: string,
  isFinal: boolean,
): Promise<number> {
  const [inserted] = await db
    .insert(applicationStatuses)
    .values({
      label,
      title,
      description: title,
      variant: 'default',
      isFinal,
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

beforeAll(async () => {
  approvedStatusId = await ensureApplicationStatus(
    'approved',
    'Accepted',
    true,
  );
  pendingReviewStatusId = await ensureApplicationStatus(
    'pending_review',
    'Under review',
    false,
  );

  pendingRsvpStatusId = await ensureRsvpStatus('pending', 'RSVP Invited', false);
  acceptedRsvpStatusId = await ensureRsvpStatus('accepted', 'Accepted', true);
  declinedRsvpStatusId = await ensureRsvpStatus('declined', 'Declined', true);
  timedOutRsvpStatusId = await ensureRsvpStatus(
    'timed_out',
    'RSVP Timed Out',
    true,
  );

  const [eventRow] = await db
    .insert(events)
    .values({
      name: 'Eligibility Test Event',
      hasApplication: true,
      capacity: 10,
    })
    .returning({ id: events.id });
  testEventId = eventRow.id;

  const users = await db
    .insert(user)
    .values([
      {
        name: 'Never Invited',
        email: 'eligible-never@example.com',
        emailVerified: true,
      },
      {
        name: 'Pending RSVP',
        email: 'eligible-pending@example.com',
        emailVerified: true,
      },
      {
        name: 'Accepted RSVP',
        email: 'eligible-accepted@example.com',
        emailVerified: true,
      },
      {
        name: 'Declined RSVP',
        email: 'eligible-declined@example.com',
        emailVerified: true,
      },
      {
        name: 'Timed Out RSVP',
        email: 'eligible-timedout@example.com',
        emailVerified: true,
      },
      {
        name: 'Existing Attendee',
        email: 'eligible-attendee@example.com',
        emailVerified: true,
      },
      {
        name: 'Pending Review',
        email: 'eligible-review@example.com',
        emailVerified: true,
      },
    ])
    .returning({ id: user.id, email: user.email });

  const byEmail = Object.fromEntries(users.map((u) => [u.email, u.id]));
  neverInvitedUserId = byEmail['eligible-never@example.com']!;
  pendingUserId = byEmail['eligible-pending@example.com']!;
  acceptedUserId = byEmail['eligible-accepted@example.com']!;
  declinedUserId = byEmail['eligible-declined@example.com']!;
  timedOutUserId = byEmail['eligible-timedout@example.com']!;
  attendeeUserId = byEmail['eligible-attendee@example.com']!;
  pendingReviewUserId = byEmail['eligible-review@example.com']!;

  await db.insert(eventApplications).values([
    {
      eventId: testEventId,
      userId: neverInvitedUserId,
      statusId: approvedStatusId,
    },
    {
      eventId: testEventId,
      userId: pendingUserId,
      statusId: approvedStatusId,
    },
    {
      eventId: testEventId,
      userId: acceptedUserId,
      statusId: approvedStatusId,
    },
    {
      eventId: testEventId,
      userId: declinedUserId,
      statusId: approvedStatusId,
    },
    {
      eventId: testEventId,
      userId: timedOutUserId,
      statusId: approvedStatusId,
    },
    {
      eventId: testEventId,
      userId: attendeeUserId,
      statusId: approvedStatusId,
    },
    {
      eventId: testEventId,
      userId: pendingReviewUserId,
      statusId: pendingReviewStatusId,
    },
  ]);

  await db.insert(eventAttendees).values({
    eventId: testEventId,
    userId: attendeeUserId,
  });

  const [wave] = await db
    .insert(eventRsvpWaves)
    .values({
      eventId: testEventId,
      wave: 1,
      respondBy: new Date('2099-01-01T00:00:00.000Z'),
    })
    .returning({ id: eventRsvpWaves.id });

  await db.insert(eventRsvpResponses).values([
    {
      rsvpWaveId: wave.id,
      userId: pendingUserId,
      statusId: pendingRsvpStatusId,
    },
    {
      rsvpWaveId: wave.id,
      userId: acceptedUserId,
      statusId: acceptedRsvpStatusId,
    },
    {
      rsvpWaveId: wave.id,
      userId: declinedUserId,
      statusId: declinedRsvpStatusId,
    },
    {
      rsvpWaveId: wave.id,
      userId: timedOutUserId,
      statusId: timedOutRsvpStatusId,
    },
  ]);
});

afterAll(async () => {
  await db
    .delete(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, testEventId));
  await db
    .delete(eventAttendees)
    .where(eq(eventAttendees.eventId, testEventId));
  await db
    .delete(eventApplications)
    .where(eq(eventApplications.eventId, testEventId));
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(user).where(eq(user.id, neverInvitedUserId));
  await db.delete(user).where(eq(user.id, pendingUserId));
  await db.delete(user).where(eq(user.id, acceptedUserId));
  await db.delete(user).where(eq(user.id, declinedUserId));
  await db.delete(user).where(eq(user.id, timedOutUserId));
  await db.delete(user).where(eq(user.id, attendeeUserId));
  await db.delete(user).where(eq(user.id, pendingReviewUserId));
});

describe('getEligibleRsvpApplicants', () => {
  test('returns null for a missing event', async () => {
    const result = await getEligibleRsvpApplicants(
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result).toBeNull();
  });

  test('includes never-invited and timed-out approved applicants only', async () => {
    const result = await getEligibleRsvpApplicants(testEventId);
    expect(result).not.toBeNull();
    if (!result) return;

    const ids = result.applicants.map((a) => a.userId).sort();
    expect(ids).toEqual([neverInvitedUserId, timedOutUserId].sort());

    expect(result.capacity).toBe(10);
    expect(result.attendeeCount).toBe(1);
    expect(result.availableSpots).toBe(9);
  });

  test('treats expired pending deadlines as non-blocking when already timed out', async () => {
    // After marking timed_out, the previously pending user becomes eligible.
    await db
      .update(eventRsvpResponses)
      .set({ statusId: timedOutRsvpStatusId })
      .where(eq(eventRsvpResponses.userId, pendingUserId));

    const result = await getEligibleRsvpApplicants(testEventId);
    expect(result).not.toBeNull();
    if (!result) return;

    const ids = new Set(result.applicants.map((a) => a.userId));
    expect(ids.has(pendingUserId)).toBe(true);
    expect(ids.has(neverInvitedUserId)).toBe(true);
    expect(ids.has(timedOutUserId)).toBe(true);
    expect(ids.has(acceptedUserId)).toBe(false);
    expect(ids.has(declinedUserId)).toBe(false);
    expect(ids.has(attendeeUserId)).toBe(false);
    expect(ids.has(pendingReviewUserId)).toBe(false);

    // Restore pending for isolation of any later assertions.
    await db
      .update(eventRsvpResponses)
      .set({ statusId: pendingRsvpStatusId })
      .where(eq(eventRsvpResponses.userId, pendingUserId));
  });

  test('reports zero available spots when capacity is full', async () => {
    const [fullEvent] = await db
      .insert(events)
      .values({
        name: 'Full Capacity Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: events.id });

    const [fullUser] = await db
      .insert(user)
      .values({
        name: 'Full Capacity User',
        email: 'eligible-full@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    await db.insert(eventApplications).values({
      eventId: fullEvent.id,
      userId: fullUser.id,
      statusId: approvedStatusId,
    });
    await db.insert(eventAttendees).values({
      eventId: fullEvent.id,
      userId: fullUser.id,
    });

    try {
      const result = await getEligibleRsvpApplicants(fullEvent.id);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.capacity).toBe(1);
      expect(result.attendeeCount).toBe(1);
      expect(result.availableSpots).toBe(0);
      expect(result.applicants).toHaveLength(0);
    } finally {
      await db
        .delete(eventAttendees)
        .where(eq(eventAttendees.eventId, fullEvent.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, fullEvent.id));
      await db.delete(events).where(eq(events.id, fullEvent.id));
      await db.delete(user).where(eq(user.id, fullUser.id));
    }
  });

  test('treats null capacity as unlimited', async () => {
    const [openEvent] = await db
      .insert(events)
      .values({
        name: 'Unlimited Capacity Event',
        hasApplication: true,
        capacity: null,
      })
      .returning({ id: events.id });

    try {
      const result = await getEligibleRsvpApplicants(openEvent.id);
      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.capacity).toBeNull();
      expect(result.availableSpots).toBeNull();
    } finally {
      await db.delete(events).where(eq(events.id, openEvent.id));
    }
  });
});
