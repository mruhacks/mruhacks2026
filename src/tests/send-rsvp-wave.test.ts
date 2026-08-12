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
import { extractEventIdFromRsvpCallback } from '@/lib/rsvp/resolve-rsvp-magic-link-email';
import {
  getMagicLinkCallbackURL,
  resolveMagicLinkMailOptions,
} from '@/lib/auth/resolve-magic-link-email';

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

// ─── getMagicLinkCallbackURL / extractEventIdFromRsvpCallback ────────────────

describe('getMagicLinkCallbackURL', () => {
  const eventId = '123e4567-e89b-12d3-a456-426614174000';

  test('returns relative callback URLs including source=rsvp', () => {
    expect(
      getMagicLinkCallbackURL(
        magicLinkUrlFor(`/dashboard/events/${eventId}?source=rsvp`),
      ),
    ).toBe(`/dashboard/events/${eventId}?source=rsvp`);
  });

  test('rejects external or protocol-relative callbacks', () => {
    expect(
      getMagicLinkCallbackURL(
        magicLinkUrlFor(
          `https://evil.example/dashboard/events/${eventId}?source=rsvp`,
        ),
      ),
    ).toBeNull();
    expect(
      getMagicLinkCallbackURL(
        magicLinkUrlFor(
          `//evil.example/dashboard/events/${eventId}?source=rsvp`,
        ),
      ),
    ).toBeNull();
  });
});

describe('extractEventIdFromRsvpCallback', () => {
  const eventId = '123e4567-e89b-12d3-a456-426614174000';

  test('extracts event ID from a valid event dashboard path', () => {
    expect(
      extractEventIdFromRsvpCallback(
        `/dashboard/events/${eventId}?source=rsvp`,
      ),
    ).toBe(eventId);
  });

  test('rejects unrelated or invalid paths', () => {
    expect(extractEventIdFromRsvpCallback('/welcome')).toBeNull();
    expect(
      extractEventIdFromRsvpCallback('/welcome?invited=1'),
    ).toBeNull();
    expect(
      extractEventIdFromRsvpCallback(
        '/dashboard/events/not-a-uuid?source=rsvp',
      ),
    ).toBeNull();
  });
});

// ─── resolveMagicLinkMailOptions ─────────────────────────────────────────────

describe('resolveMagicLinkMailOptions', () => {
  test('uses generic sign-in copy for normal and invite callbacks', async () => {
    const signIn = await resolveMagicLinkMailOptions({
      email: 'anyone@example.com',
      magicLinkUrl: magicLinkUrlFor('/welcome'),
    });
    expect(signIn.subject).toBe('Sign in to MRUHacks');

    const invite = await resolveMagicLinkMailOptions({
      email: 'anyone@example.com',
      magicLinkUrl: magicLinkUrlFor('/welcome?invited=1'),
    });
    expect(invite.subject).toBe('Sign in to MRUHacks');
  });

  test('uses generic sign-in copy for event page without source=rsvp', async () => {
    const result = await resolveMagicLinkMailOptions({
      email: 'anyone@example.com',
      magicLinkUrl: magicLinkUrlFor(`/dashboard/events/${testEventId}`),
    });
    expect(result.subject).toBe('Sign in to MRUHacks');
  });

  test('fails when source=rsvp is present but path is invalid', async () => {
    await expect(
      resolveMagicLinkMailOptions({
        email: 'anyone@example.com',
        magicLinkUrl: magicLinkUrlFor(
          '/dashboard/events/not-a-uuid?source=rsvp',
        ),
      }),
    ).rejects.toThrow(/invalid/);
  });

  test('fails when source=rsvp is present but no pending RSVP exists', async () => {
    await expect(
      resolveMagicLinkMailOptions({
        email: 'approved-rsvp@example.com',
        magicLinkUrl: magicLinkUrlFor(
          `/dashboard/events/${testEventId}?source=rsvp`,
        ),
      }),
    ).rejects.toThrow(/pending RSVP/);
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

  test('creates wave, pending responses, and sends RSVP-specific magic-link email', async () => {
    vi.mocked(sendMail).mockClear();
    const signInSpy = vi.spyOn(auth.api, 'signInMagicLink');

    try {
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

      const callbackURL = `/dashboard/events/${testEventId}?source=rsvp`;
      expect(signInSpy).toHaveBeenCalledTimes(1);
      expect(signInSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            email: 'approved-rsvp@example.com',
            callbackURL,
            errorCallbackURL: callbackURL,
          },
          headers: expect.any(Headers),
        }),
      );

      expect(sendMail).toHaveBeenCalledTimes(1);
      const mailCall = vi.mocked(sendMail).mock.calls[0]?.[0];
      expect(mailCall?.to).toBe('approved-rsvp@example.com');
      expect(mailCall?.subject).toBe('RSVP invitation — RSVP Wave Test Event');
      expect(mailCall?.subject).not.toBe('Sign in to MRUHacks');
      expect(mailCall?.html).toContain('View RSVP');
      expect(mailCall?.html).toContain('RSVP Wave Test Event');
      expect(mailCall?.text).toMatch(/respond by/i);
      expect(mailCall?.html).toContain('/magic-link/verify');
    } finally {
      signInSpy.mockRestore();
    }
  });

  test('does not re-invite users who still have an active pending RSVP', async () => {
    vi.mocked(sendMail).mockClear();

    const result = await sendRsvpWave(testEventId, respondBy);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.wave.wave).toBe(2);
    expect(result.eligibleApplicantCount).toBe(0);
    expect(result.responsesCreated).toBe(0);
    expect(result.emailsSent).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
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

    vi.mocked(sendMail).mockClear();
    const result = await sendRsvpWave(testEventId, respondBy);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.wave.wave).toBe(3);
    expect(result.eligibleApplicantCount).toBe(1);
    expect(result.responsesCreated).toBe(1);
    expect(result.emailsSent).toBe(1);
  });

  test('reports magic-link / email failures without deleting RSVP records', async () => {
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

    const latest = await db
      .select({
        statusId: eventRsvpResponses.statusId,
      })
      .from(eventRsvpResponses)
      .innerJoin(
        eventRsvpWaves,
        eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
      )
      .where(eq(eventRsvpWaves.id, result.wave.id));

    expect(latest).toHaveLength(1);
    expect(latest[0]?.statusId).toBe(pendingRsvpStatusId);
  });

  test('continues inviting remaining applicants when one magic link fails', async () => {
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

    const signInSpy = vi
      .spyOn(auth.api, 'signInMagicLink')
      .mockImplementationOnce(async () => {
        throw new Error('magic link unavailable');
      });

    vi.mocked(sendMail).mockClear();

    try {
      const result = await sendRsvpWave(testEventId, respondBy);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.responsesCreated).toBe(2);
      expect(result.emailsSent).toBe(1);
      expect(result.emailFailures).toHaveLength(1);
      expect(result.emailFailures[0]?.error).toContain('magic link unavailable');
      expect(sendMail).toHaveBeenCalledTimes(1);
    } finally {
      signInSpy.mockRestore();
      await db
        .delete(eventRsvpResponses)
        .where(eq(eventRsvpResponses.userId, secondUser.id));
      await db
        .delete(eventApplications)
        .where(eq(eventApplications.userId, secondUser.id));
      await db.delete(user).where(eq(user.id, secondUser.id));
    }
  });

  test('does not invite non-approved applicants', async () => {
    vi.mocked(sendMail).mockClear();
    const signInSpy = vi.spyOn(auth.api, 'signInMagicLink');

    try {
      // Prior test left the approved user pending; pending_review stays ineligible.
      const result = await sendRsvpWave(testEventId, respondBy);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.eligibleApplicantCount).toBe(0);
      expect(signInSpy).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
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

  test('concurrent waves for different events do not mix email content', async () => {
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

    vi.mocked(sendMail).mockClear();

    try {
      const [resultA, resultB] = await Promise.all([
        sendRsvpWave(eventA.id, respondBy),
        sendRsvpWave(eventB.id, respondBy),
      ]);

      expect(resultA.success).toBe(true);
      expect(resultB.success).toBe(true);

      const mails = vi.mocked(sendMail).mock.calls.map((call) => call[0]);
      expect(mails).toHaveLength(2);

      const mailForA = mails.find((m) => m.to === 'concurrent-a@example.com');
      const mailForB = mails.find((m) => m.to === 'concurrent-b@example.com');
      expect(mailForA?.subject).toBe('RSVP invitation — Concurrent Event A');
      expect(mailForB?.subject).toBe('RSVP invitation — Concurrent Event B');
      expect(mailForA?.html).toContain('Concurrent Event A');
      expect(mailForA?.html).not.toContain('Concurrent Event B');
      expect(mailForB?.html).toContain('Concurrent Event B');
      expect(mailForB?.html).not.toContain('Concurrent Event A');
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

  test('creates an empty wave and sends no emails', async () => {
    vi.mocked(sendMail).mockClear();
    const signInSpy = vi.spyOn(auth.api, 'signInMagicLink');

    try {
      const result = await sendRsvpWave(emptyEventId, respondBy);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.wave.wave).toBe(1);
      expect(result.eligibleApplicantCount).toBe(0);
      expect(result.responsesCreated).toBe(0);
      expect(result.emailsSent).toBe(0);
      expect(result.emailFailures).toHaveLength(0);
      expect(signInSpy).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      signInSpy.mockRestore();
    }
  });
});
