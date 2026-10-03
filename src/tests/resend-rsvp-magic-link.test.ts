import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { count, eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  eventInvitations,
  eventRsvpWaves,
  events,
  user,
  verification,
} from '@/db/schema';
import { MAGIC_LINK_EXPIRES_IN_SECONDS } from '@/utils/auth';
import { resendRsvpMagicLink } from '@/lib/rsvp/resend-rsvp-magic-link';
import { getRsvpMagicLinkCallbackURL } from '@/lib/rsvp/send-rsvp-magic-link';
import { getStatus, insertInvitation } from '@/tests/participation-fixtures';

vi.mock('@/utils/mail', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { sendMail } from '@/utils/mail';
import { auth } from '@/utils/auth';

function magicLinkTokenFromLastMail(): string {
  const mail = vi.mocked(sendMail).mock.calls.at(-1)?.[0];
  const match = mail?.text?.match(/token=([A-Za-z]+)/);
  if (!match?.[1]) {
    throw new Error('magic-link token missing from mail');
  }
  return match[1];
}

async function getVerificationExpiresAt(token: string): Promise<Date> {
  const [row] = await db
    .select({ expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, token))
    .limit(1);
  if (!row) {
    throw new Error('verification row missing');
  }
  return row.expiresAt;
}

async function deleteVerification(token: string): Promise<void> {
  await db.delete(verification).where(eq(verification.identifier, token));
}

let testEventId: string;
let testUserId: string;
let testWaveId: string;
let testResponseId: string;

beforeAll(async () => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';

  const [eventRow] = await db
    .insert(events)
    .values({ name: 'Resend Magic Link Event', hasApplication: true })
    .returning({ id: events.id });
  testEventId = eventRow.id;

  const [userRow] = await db
    .insert(user)
    .values({
      name: 'Resend RSVP User',
      email: 'resend-rsvp@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  testUserId = userRow.id;

  const [wave] = await db
    .insert(eventRsvpWaves)
    .values({
      eventId: testEventId,
      wave: 1,
      respondBy: new Date('2099-12-01T00:00:00.000Z'),
    })
    .returning({ id: eventRsvpWaves.id });
  testWaveId = wave.id;

  const { invitationId } = await insertInvitation({
    rsvpWaveId: testWaveId,
    eventId: testEventId,
    userId: testUserId,
  });
  testResponseId = invitationId;
});

afterAll(async () => {
  await db
    .delete(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, testEventId));
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(user).where(eq(user.id, testUserId));
});

describe('RSVP magic-link expiration / resend', () => {
  test('keeps the default sign-in magic-link lifetime at 24h', () => {
    expect(MAGIC_LINK_EXPIRES_IN_SECONDS).toBe(86400);
  });

  test('sign-in magic links still expire after 24h when no RSVP context is set', async () => {
    vi.mocked(sendMail).mockClear();
    const email = `login-lifetime-${Date.now()}@example.com`;

    let token: string | undefined;
    try {
      await auth.api.signInMagicLink({
        body: {
          email,
          callbackURL: '/dashboard',
        },
        headers: new Headers({ origin: 'http://localhost:3000' }),
      });

      token = magicLinkTokenFromLastMail();
      const expiresAt = await getVerificationExpiresAt(token);
      const expected = Date.now() + MAGIC_LINK_EXPIRES_IN_SECONDS * 1000;
      expect(Math.abs(expiresAt.getTime() - expected)).toBeLessThan(5000);
      expect(vi.mocked(sendMail).mock.calls[0]?.[0]?.subject).toBe(
        'Sign in to MRUHacks',
      );
    } finally {
      if (token) await deleteVerification(token);
    }
  });

  test('resends a fresh magic link without creating a wave or response', async () => {
    vi.mocked(sendMail).mockClear();
    const signInSpy = vi.spyOn(auth.api, 'signInMagicLink');

    const [{ value: wavesBefore }] = await db
      .select({ value: count() })
      .from(eventRsvpWaves)
      .where(eq(eventRsvpWaves.eventId, testEventId));
    const [{ value: responsesBefore }] = await db
      .select({ value: count() })
      .from(eventInvitations)
      .where(eq(eventInvitations.rsvpWaveId, testWaveId));

    try {
      const result = await resendRsvpMagicLink({
        eventId: testEventId,
        userId: testUserId,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.responseId).toBe(testResponseId);
      expect(result.waveId).toBe(testWaveId);
      expect(result.email).toBe('resend-rsvp@example.com');

      const callbackURL = getRsvpMagicLinkCallbackURL(testEventId);
      expect(callbackURL).toBe(`/dashboard/events/${testEventId}?source=rsvp`);
      expect(signInSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            email: 'resend-rsvp@example.com',
            callbackURL,
            errorCallbackURL: callbackURL,
          },
          headers: expect.any(Headers),
        }),
      );

      expect(sendMail).toHaveBeenCalledTimes(1);
      const mailCall = vi.mocked(sendMail).mock.calls[0]?.[0];
      expect(mailCall?.to).toBe('resend-rsvp@example.com');
      expect(mailCall?.subject).toBe(
        "[Action Required] You're invited to Resend Magic Link Event!",
      );
      expect(mailCall?.subject).not.toBe('Sign in to MRUHacks');
      expect(mailCall?.html).toContain('RSVP Now');

      const token = magicLinkTokenFromLastMail();
      const expiresAt = await getVerificationExpiresAt(token);
      expect(
        Math.abs(
          expiresAt.getTime() - new Date('2099-12-01T00:00:00.000Z').getTime(),
        ),
      ).toBeLessThan(5000);
      await deleteVerification(token);

      const [{ value: wavesAfter }] = await db
        .select({ value: count() })
        .from(eventRsvpWaves)
        .where(eq(eventRsvpWaves.eventId, testEventId));
      const [{ value: responsesAfter }] = await db
        .select({ value: count() })
        .from(eventInvitations)
        .where(eq(eventInvitations.rsvpWaveId, testWaveId));

      expect(Number(wavesAfter)).toBe(Number(wavesBefore));
      expect(Number(responsesAfter)).toBe(Number(responsesBefore));

      expect(await getStatus(testEventId, testUserId)).toBe('invited');
    } finally {
      signInSpy.mockRestore();
    }
  });

  test('can resend by email for the same pending RSVP', async () => {
    vi.mocked(sendMail).mockClear();

    const result = await resendRsvpMagicLink({
      eventId: testEventId,
      email: 'resend-rsvp@example.com',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.responseId).toBe(testResponseId);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test('fails when there is no pending RSVP', async () => {
    const result = await resendRsvpMagicLink({
      eventId: testEventId,
      email: 'nobody@example.com',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/no pending RSVP/i);
  });
});
