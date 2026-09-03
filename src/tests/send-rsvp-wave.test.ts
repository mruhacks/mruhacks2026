import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import { desc, eq } from 'drizzle-orm';
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
import { getRsvpMagicLinkCallbackURL } from '@/lib/rsvp/send-rsvp-magic-link';
import { runWithRsvpMagicLinkMailContext } from '@/lib/rsvp/rsvp-magic-link-context';
import { resolveMagicLinkMailOptions } from '@/lib/auth/resolve-magic-link-email';

const { publishRsvpInvitation } = vi.hoisted(() => ({
  publishRsvpInvitation: vi.fn(),
}));
vi.mock('@/lib/rsvp/rsvp-invitation-queue', () => ({
  publishRsvpInvitation,
}));

vi.mock('@/utils/mail', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { sendMail } from '@/utils/mail';
import { auth } from '@/utils/auth';

let approvedStatusId: number;
let pendingRsvpStatusId: number;
let pendingReviewStatusId: number;
let testEventId: string;
let approvedUserId: string;
let pendingUserId: string;
const respondBy = new Date('2099-08-01T23:59:59.000Z');

function magicLinkUrlFor(callbackURL: string): string {
  const url = new URL('http://localhost:3000/api/auth/magic-link/verify');
  url.searchParams.set('token', 'test-token-not-logged');
  url.searchParams.set('callbackURL', callbackURL);
  return url.toString();
}

async function getResponseByUserId(userId: string) {
  const [row] = await db
    .select({
      id: eventRsvpResponses.id,
      statusId: eventRsvpResponses.statusId,
      invitationEmailStatus: eventRsvpResponses.invitationEmailStatus,
      invitationEmailQueuedAt: eventRsvpResponses.invitationEmailQueuedAt,
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .where(eq(eventRsvpResponses.userId, userId))
    .orderBy(desc(eventRsvpWaves.wave))
    .limit(1);
  return row;
}

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

beforeEach(() => {
  publishRsvpInvitation.mockReset();
  publishRsvpInvitation.mockResolvedValue({ messageId: 'msg-id' });
  vi.mocked(sendMail).mockClear();
});

// ─── getRsvpMagicLinkCallbackURL / resolveMagicLinkMailOptions ───────────────

describe('getRsvpMagicLinkCallbackURL', () => {
  const eventId = '123e4567-e89b-12d3-a456-426614174000';

  test('returns the event dashboard path with source=rsvp', () => {
    expect(getRsvpMagicLinkCallbackURL(eventId)).toBe(
      `/dashboard/events/${eventId}?source=rsvp`,
    );
  });
});

describe('resolveMagicLinkMailOptions', () => {
  test('uses generic sign-in copy for normal and invite callbacks', () => {
    const signIn = resolveMagicLinkMailOptions({
      email: 'anyone@example.com',
      magicLinkUrl: magicLinkUrlFor('/welcome'),
    });
    expect(signIn.subject).toBe('Sign in to MRUHacks');

    const invite = resolveMagicLinkMailOptions({
      email: 'anyone@example.com',
      magicLinkUrl: magicLinkUrlFor('/welcome?invited=1'),
    });
    expect(invite.subject).toBe('Sign in to MRUHacks');
  });

  test('does not treat caller-controlled source=rsvp as RSVP mail intent', () => {
    const result = resolveMagicLinkMailOptions({
      email: 'approved-rsvp@example.com',
      magicLinkUrl: magicLinkUrlFor(
        `/dashboard/events/${testEventId}?source=rsvp`,
      ),
    });
    expect(result.subject).toBe('Sign in to MRUHacks');
  });

  test('uses RSVP invitation copy only when trusted mail context is set', () => {
    const result = runWithRsvpMagicLinkMailContext(
      { eventName: 'Hackathon', respondBy },
      () =>
        resolveMagicLinkMailOptions({
          email: 'anyone@example.com',
          magicLinkUrl: magicLinkUrlFor('/welcome'),
        }),
    );
    expect(result.subject).toBe('RSVP invitation — Hackathon');
    expect(result.html).toContain('View RSVP');
  });
});

// ─── sendRsvpWave ────────────────────────────────────────────────────────────

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

  test('creates wave, pending responses, and queues one invitation per response', async () => {
    const signInSpy = vi.spyOn(auth.api, 'signInMagicLink');

    try {
      const result = await sendRsvpWave(testEventId, respondBy);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.wave.wave).toBe(1);
      expect(result.wave.respondBy).toEqual(respondBy);
      expect(result.eligibleApplicantCount).toBe(1);
      expect(result.responsesCreated).toBe(1);
      expect(result.invitationsQueued).toBe(1);
      expect(result.queueFailures).toHaveLength(0);

      const response = await getResponseByUserId(approvedUserId);
      expect(response?.invitationEmailStatus).toBe('queued');
      expect(response?.invitationEmailQueuedAt).not.toBeNull();
      expect(response?.statusId).toBe(pendingRsvpStatusId);

      expect(publishRsvpInvitation).toHaveBeenCalledTimes(1);
      expect(publishRsvpInvitation).toHaveBeenCalledWith(response?.id);

      // The old synchronous sender must never run alongside the queue.
      expect(signInSpy).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      signInSpy.mockRestore();
    }
  });

  test('does not re-invite users who still have an active pending RSVP', async () => {
    const wavesBefore = await db
      .select({ id: eventRsvpWaves.id })
      .from(eventRsvpWaves)
      .where(eq(eventRsvpWaves.eventId, testEventId));

    const result = await sendRsvpWave(testEventId, respondBy);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/no eligible applicants/i);
    expect(publishRsvpInvitation).not.toHaveBeenCalled();

    const wavesAfter = await db
      .select({ id: eventRsvpWaves.id })
      .from(eventRsvpWaves)
      .where(eq(eventRsvpWaves.eventId, testEventId));
    expect(wavesAfter).toHaveLength(wavesBefore.length);
  });

  test('re-invites applicants after their previous RSVP times out', async () => {
    const [timedOutStatus] = await db
      .select({ id: rsvpStatuses.id })
      .from(rsvpStatuses)
      .where(eq(rsvpStatuses.label, 'timed_out'))
      .limit(1);

    let timedOutStatusId = timedOutStatus?.id;
    if (!timedOutStatusId) {
      const [inserted] = await db
        .insert(rsvpStatuses)
        .values({
          label: 'timed_out',
          title: 'RSVP Timed Out',
          description: 'RSVP Timed Out',
          variant: 'secondary',
          isFinal: true,
        })
        .returning({ id: rsvpStatuses.id });
      timedOutStatusId = inserted.id;
    }

    await db
      .update(eventRsvpResponses)
      .set({ statusId: timedOutStatusId })
      .where(eq(eventRsvpResponses.userId, approvedUserId));

    const result = await sendRsvpWave(testEventId, respondBy);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.wave.wave).toBe(2);
    expect(result.eligibleApplicantCount).toBe(1);
    expect(result.responsesCreated).toBe(1);
    expect(result.invitationsQueued).toBe(1);
  });

  test('reports queue failures without deleting RSVP records', async () => {
    const [timedOutStatus] = await db
      .select({ id: rsvpStatuses.id })
      .from(rsvpStatuses)
      .where(eq(rsvpStatuses.label, 'timed_out'))
      .limit(1);
    expect(timedOutStatus).toBeTruthy();

    await db
      .update(eventRsvpResponses)
      .set({ statusId: timedOutStatus!.id })
      .where(eq(eventRsvpResponses.userId, approvedUserId));

    publishRsvpInvitation.mockRejectedValueOnce(new Error('queue unavailable'));

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

    expect(result.invitationsQueued).toBe(0);
    expect(result.queueFailures).toHaveLength(1);
    expect(result.queueFailures[0]?.email).toBe('approved-rsvp@example.com');
    expect(result.queueFailures[0]?.error).toContain('queue unavailable');
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

    // A failed publish must leave the row 'unsent' for the reconciliation
    // sweep (Step 4) to recover — never 'queued'.
    const response = await getResponseByUserId(approvedUserId);
    expect(response?.invitationEmailStatus).toBe('unsent');
  });

  test('continues queuing remaining applicants when one publish fails', async () => {
    const [timedOutStatus] = await db
      .select({ id: rsvpStatuses.id })
      .from(rsvpStatuses)
      .where(eq(rsvpStatuses.label, 'timed_out'))
      .limit(1);
    expect(timedOutStatus).toBeTruthy();

    await db
      .update(eventRsvpResponses)
      .set({ statusId: timedOutStatus!.id })
      .where(eq(eventRsvpResponses.userId, approvedUserId));

    const [secondUser] = await db
      .insert(user)
      .values({
        name: 'Second Approved',
        email: 'approved-rsvp-2@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    await db.insert(eventApplications).values({
      eventId: testEventId,
      userId: secondUser.id,
      statusId: approvedStatusId,
    });

    publishRsvpInvitation.mockRejectedValueOnce(
      new Error('queue unavailable'),
    );

    try {
      const result = await sendRsvpWave(testEventId, respondBy);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.responsesCreated).toBe(2);
      expect(result.invitationsQueued).toBe(1);
      expect(result.queueFailures).toHaveLength(1);
      expect(result.queueFailures[0]?.error).toContain('queue unavailable');
      expect(publishRsvpInvitation).toHaveBeenCalledTimes(2);
    } finally {
      await db
        .delete(eventRsvpResponses)
        .where(eq(eventRsvpResponses.userId, secondUser.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.userId, secondUser.id));
      await db.delete(user).where(eq(user.id, secondUser.id));
    }
  });

  test('never regresses a response a fast consumer already marked sent back to queued', async () => {
    const [timedOutStatus] = await db
      .select({ id: rsvpStatuses.id })
      .from(rsvpStatuses)
      .where(eq(rsvpStatuses.label, 'timed_out'))
      .limit(1);
    expect(timedOutStatus).toBeTruthy();

    await db
      .update(eventRsvpResponses)
      .set({ statusId: timedOutStatus!.id })
      .where(eq(eventRsvpResponses.userId, approvedUserId));

    // Simulate the consumer racing ahead of the producer: by the time
    // publishRsvpInvitation "returns", the message has already been
    // delivered, processed, and marked 'sent'.
    publishRsvpInvitation.mockImplementationOnce(async (responseId: string) => {
      await db
        .update(eventRsvpResponses)
        .set({ invitationEmailStatus: 'sent', invitationEmailSentAt: new Date() })
        .where(eq(eventRsvpResponses.id, responseId));
      return { messageId: 'msg-race' };
    });

    const result = await sendRsvpWave(testEventId, respondBy);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.invitationsQueued).toBe(1);

    const response = await getResponseByUserId(approvedUserId);
    expect(response?.invitationEmailStatus).toBe('sent');
  });

  test('does not invite non-approved applicants', async () => {
    const signInSpy = vi.spyOn(auth.api, 'signInMagicLink');

    try {
      // Prior test left the approved user pending; pending_review stays ineligible.
      const result = await sendRsvpWave(testEventId, respondBy);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/no eligible applicants/i);
      expect(signInSpy).not.toHaveBeenCalled();
      expect(publishRsvpInvitation).not.toHaveBeenCalled();
    } finally {
      signInSpy.mockRestore();
    }
  });

  test('refuses a wave when eligible applicants exceed remaining capacity', async () => {
    const [capEvent] = await db
      .insert(events)
      .values({
        name: 'Capacity Limited RSVP Event',
        hasApplication: true,
        capacity: 1,
      })
      .returning({ id: events.id });

    const [userA] = await db
      .insert(user)
      .values({
        name: 'Cap A',
        email: 'cap-a@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    const [userB] = await db
      .insert(user)
      .values({
        name: 'Cap B',
        email: 'cap-b@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    await db.insert(eventApplications).values([
      {
        eventId: capEvent.id,
        userId: userA.id,
        statusId: approvedStatusId,
      },
      {
        eventId: capEvent.id,
        userId: userB.id,
        statusId: approvedStatusId,
      },
    ]);

    try {
      const result = await sendRsvpWave(capEvent.id, respondBy);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/exceed.*available spots/i);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, capEvent.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, capEvent.id));
      await db.delete(events).where(eq(events.id, capEvent.id));
      await db.delete(user).where(eq(user.id, userA.id));
      await db.delete(user).where(eq(user.id, userB.id));
    }
  });

  test('publishes a distinct queue message per event for concurrent waves', async () => {
    const [eventA] = await db
      .insert(events)
      .values({ name: 'Concurrent Event A', hasApplication: true })
      .returning({ id: events.id });
    const [eventB] = await db
      .insert(events)
      .values({ name: 'Concurrent Event B', hasApplication: true })
      .returning({ id: events.id });

    const [userA] = await db
      .insert(user)
      .values({
        name: 'Concurrent A',
        email: 'concurrent-a@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    const [userB] = await db
      .insert(user)
      .values({
        name: 'Concurrent B',
        email: 'concurrent-b@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    await db.insert(eventApplications).values([
      {
        eventId: eventA.id,
        userId: userA.id,
        statusId: approvedStatusId,
      },
      {
        eventId: eventB.id,
        userId: userB.id,
        statusId: approvedStatusId,
      },
    ]);

    try {
      const [resultA, resultB] = await Promise.all([
        sendRsvpWave(eventA.id, respondBy),
        sendRsvpWave(eventB.id, respondBy),
      ]);

      expect(resultA.success).toBe(true);
      expect(resultB.success).toBe(true);

      const responseA = await getResponseByUserId(userA.id);
      const responseB = await getResponseByUserId(userB.id);

      expect(responseA?.invitationEmailStatus).toBe('queued');
      expect(responseB?.invitationEmailStatus).toBe('queued');

      const publishedIds = publishRsvpInvitation.mock.calls.map(
        (call) => call[0],
      );
      expect(publishedIds).toContain(responseA?.id);
      expect(publishedIds).toContain(responseB?.id);
      expect(new Set(publishedIds).size).toBe(publishedIds.length);
    } finally {
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventA.id));
      await db
        .delete(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, eventB.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventA.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.eventId, eventB.id));
      await db.delete(events).where(eq(events.id, eventA.id));
      await db.delete(events).where(eq(events.id, eventB.id));
      await db.delete(user).where(eq(user.id, userA.id));
      await db.delete(user).where(eq(user.id, userB.id));
    }
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

  test('refuses to create a wave when nobody is eligible', async () => {
    const signInSpy = vi.spyOn(auth.api, 'signInMagicLink');

    try {
      const result = await sendRsvpWave(emptyEventId, respondBy);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/no eligible applicants/i);
      expect(signInSpy).not.toHaveBeenCalled();
      expect(publishRsvpInvitation).not.toHaveBeenCalled();

      const waves = await db
        .select({ id: eventRsvpWaves.id })
        .from(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, emptyEventId));
      expect(waves).toHaveLength(0);
    } finally {
      signInSpy.mockRestore();
    }
  });
});
