import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import {
  user,
  events,
  eventApplications,
  applicationStatuses,
  rsvpStatuses,
  eventRsvpWaves,
  eventRsvpResponses,
} from '@/db/schema';
import { sendRsvpWave } from '@/lib/rsvp/send-rsvp-wave';

vi.mock('@/utils/mail', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { sendMail } from '@/utils/mail';

let approvedStatusId: number;
let pendingRsvpStatusId: number;
let pendingReviewStatusId: number;
let testEventId: string;
let approvedUserId: string;
let pendingUserId: string;
const respondBy = new Date('2026-08-01T23:59:59.000Z');

beforeAll(async () => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';

  const [approvedStatus] = await db
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

  if (approvedStatus) {
    approvedStatusId = approvedStatus.id;
  } else {
    const [existing] = await db
      .select({ id: applicationStatuses.id })
      .from(applicationStatuses)
      .where(eq(applicationStatuses.label, 'approved'))
      .limit(1);
    approvedStatusId = existing.id;
  }

  const [pendingReviewStatus] = await db
    .insert(applicationStatuses)
    .values({
      label: 'pending_review',
      title: 'Under review',
      description: 'Under review',
      variant: 'warning',
      isFinal: false,
    })
    .onConflictDoNothing()
    .returning({ id: applicationStatuses.id });

  if (pendingReviewStatus) {
    pendingReviewStatusId = pendingReviewStatus.id;
  } else {
    const [existing] = await db
      .select({ id: applicationStatuses.id })
      .from(applicationStatuses)
      .where(eq(applicationStatuses.label, 'pending_review'))
      .limit(1);
    pendingReviewStatusId = existing.id;
  }

  const [pendingRsvpStatus] = await db
    .insert(rsvpStatuses)
    .values({
      label: 'pending',
      title: 'RSVP Invited',
      description: 'RSVP Invited',
      variant: 'default',
      isFinal: false,
    })
    .onConflictDoNothing()
    .returning({ id: rsvpStatuses.id });

  if (pendingRsvpStatus) {
    pendingRsvpStatusId = pendingRsvpStatus.id;
  } else {
    const [existing] = await db
      .select({ id: rsvpStatuses.id })
      .from(rsvpStatuses)
      .where(eq(rsvpStatuses.label, 'pending'))
      .limit(1);
    pendingRsvpStatusId = existing.id;
  }

  const [eventRow] = await db
    .insert(events)
    .values({ name: 'RSVP Wave Test Event', hasApplication: true })
    .returning({ id: events.id });
  testEventId = eventRow.id;

  const [approvedUser] = await db
    .insert(user)
    .values({
      name: 'Approved Applicant',
      email: 'approved-rsvp@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  approvedUserId = approvedUser.id;

  const [pendingUser] = await db
    .insert(user)
    .values({
      name: 'Pending Applicant',
      email: 'pending-rsvp@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  pendingUserId = pendingUser.id;

  await db.insert(eventApplications).values([
    {
      eventId: testEventId,
      userId: approvedUserId,
      statusId: approvedStatusId,
    },
    {
      eventId: testEventId,
      userId: pendingUserId,
      statusId: pendingReviewStatusId,
    },
  ]);
});

afterAll(async () => {
  await db
    .delete(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, testEventId));
  await db
    .delete(eventApplications)
    .where(eq(eventApplications.eventId, testEventId));
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(user).where(eq(user.id, approvedUserId));
  await db.delete(user).where(eq(user.id, pendingUserId));
});

describe('sendRsvpWave', () => {
  test('returns error when event does not exist', async () => {
    const result = await sendRsvpWave(
      '00000000-0000-0000-0000-000000000000',
      respondBy,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Event not found');
    }
  });

  test('creates wave 1, pending responses for approved applicants only, and sends emails', async () => {
    vi.mocked(sendMail).mockClear();

    const result = await sendRsvpWave(testEventId, respondBy);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.wave.wave).toBe(1);
    expect(result.wave.respondBy).toEqual(respondBy);
    expect(result.eligibleApplicantCount).toBe(1);
    expect(result.responsesCreated).toBe(1);
    expect(result.emailsSent).toBe(1);
    expect(result.emailFailures).toHaveLength(0);

    const responses = await db
      .select({
        userId: eventRsvpResponses.userId,
        statusId: eventRsvpResponses.statusId,
      })
      .from(eventRsvpResponses)
      .innerJoin(
        eventRsvpWaves,
        eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
      )
      .where(eq(eventRsvpWaves.eventId, testEventId));

    expect(responses).toHaveLength(1);
    expect(responses[0]?.userId).toBe(approvedUserId);
    expect(responses[0]?.statusId).toBe(pendingRsvpStatusId);

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'approved-rsvp@example.com',
        subject: expect.stringContaining('RSVP Wave Test Event'),
      }),
    );
  });

  test('creates the next wave number on subsequent calls', async () => {
    vi.mocked(sendMail).mockClear();

    const result = await sendRsvpWave(testEventId, respondBy);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.wave.wave).toBe(2);
    expect(result.responsesCreated).toBe(1);
    expect(result.emailsSent).toBe(1);
  });

  test('reports email failures without deleting RSVP records', async () => {
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('SMTP unavailable'));

    const beforeCount = await db
      .select({ id: eventRsvpResponses.id })
      .from(eventRsvpResponses)
      .innerJoin(
        eventRsvpWaves,
        eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
      )
      .where(eq(eventRsvpWaves.eventId, testEventId));

    const result = await sendRsvpWave(testEventId, respondBy);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.emailsSent).toBe(0);
    expect(result.emailFailures).toHaveLength(1);
    expect(result.emailFailures[0]?.email).toBe('approved-rsvp@example.com');
    expect(result.emailFailures[0]?.error).toContain('SMTP unavailable');
    expect(result.responsesCreated).toBe(1);

    const afterCount = await db
      .select({ id: eventRsvpResponses.id })
      .from(eventRsvpResponses)
      .innerJoin(
        eventRsvpWaves,
        eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
      )
      .where(eq(eventRsvpWaves.eventId, testEventId));

    expect(afterCount.length).toBe(beforeCount.length + 1);
  });
});

describe('sendRsvpWave with no approved applicants', () => {
  let emptyEventId: string;

  beforeAll(async () => {
    const [eventRow] = await db
      .insert(events)
      .values({ name: 'Empty RSVP Event', hasApplication: true })
      .returning({ id: events.id });
    emptyEventId = eventRow.id;
  });

  afterAll(async () => {
    await db
      .delete(eventRsvpWaves)
      .where(eq(eventRsvpWaves.eventId, emptyEventId));
    await db.delete(events).where(eq(events.id, emptyEventId));
  });

  test('creates an empty wave and sends no emails', async () => {
    vi.mocked(sendMail).mockClear();

    const result = await sendRsvpWave(emptyEventId, respondBy);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.wave.wave).toBe(1);
    expect(result.eligibleApplicantCount).toBe(0);
    expect(result.responsesCreated).toBe(0);
    expect(result.emailsSent).toBe(0);
    expect(result.emailFailures).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
