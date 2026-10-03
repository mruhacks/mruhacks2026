import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  events,
  eventInvitations,
  eventRsvpWaves,
  user,
  verification,
} from '@/db/schema';
import { insertInvitation } from '@/tests/participation-fixtures';
import {
  MAX_INVITATION_DELIVERY_ATTEMPTS,
  processRsvpInvitation,
} from '@/lib/rsvp/process-rsvp-invitation';

vi.mock('@/utils/mail', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { sendMail } from '@/utils/mail';
import { auth } from '@/utils/auth';

let testEventId: string;
let testUserId: string;

async function createResponse(options: {
  statusLabel?: keyof typeof STATUS_BY_LABEL;
  respondBy: Date;
  invitationEmailStatus?: string;
  invitationEmailAttempts?: number;
}): Promise<{ responseId: string; waveId: string }> {
  // One event per invitation: a participant is invited at most once.
  const [eventRow] = await db
    .insert(events)
    .values({ name: 'Invitation Delivery Test', hasApplication: true })
    .returning({ id: events.id });
  const [wave] = await db
    .insert(eventRsvpWaves)
    .values({ eventId: eventRow.id, wave: 1, respondBy: options.respondBy })
    .returning({ id: eventRsvpWaves.id });

  const { invitationId } = await insertInvitation({
    rsvpWaveId: wave.id,
    eventId: eventRow.id,
    userId: testUserId,
    status: STATUS_BY_LABEL[options.statusLabel ?? 'pending'],
    invitationEmailStatus: options.invitationEmailStatus ?? 'queued',
    invitationEmailAttempts: options.invitationEmailAttempts ?? 0,
  });

  // `waveId` is the event here: deleting it cascades to everything above.
  return { responseId: invitationId, waveId: eventRow.id };
}

async function getResponse(responseId: string) {
  const [row] = await db
    .select()
    .from(eventInvitations)
    .where(eq(eventInvitations.id, responseId))
    .limit(1);
  return row;
}

async function deleteResponse(eventId: string): Promise<void> {
  // Cascades to the wave, participant and invitation rows.
  await db.delete(events).where(eq(events.id, eventId));
}

const STATUS_BY_LABEL = {
  pending: 'invited',
  accepted: 'accepted',
  declined: 'declined',
  timed_out: 'timed_out',
} as const;

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

beforeAll(async () => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';

  const [eventRow] = await db
    .insert(events)
    .values({ name: 'Process Invitation Test Event', hasApplication: true })
    .returning({ id: events.id });
  testEventId = eventRow.id;

  const [userRow] = await db
    .insert(user)
    .values({
      name: 'Process Invitation User',
      email: 'process-invitation@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  testUserId = userRow.id;
});

afterAll(async () => {
  await db
    .delete(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, testEventId));
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(user).where(eq(user.id, testUserId));
});

describe('processRsvpInvitation', () => {
  test('sends the invitation and marks the response sent', async () => {
    vi.mocked(sendMail).mockClear();
    const signInSpy = vi.spyOn(auth.api, 'signInMagicLink');
    const respondBy = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const { responseId, waveId } = await createResponse({
      respondBy,
    });

    let token: string | undefined;
    try {
      const outcome = await processRsvpInvitation(responseId, 1);
      expect(outcome).toBe('sent');
      expect(signInSpy).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledTimes(1);

      const row = await getResponse(responseId);
      expect(row.invitationEmailStatus).toBe('sent');
      expect(row.invitationEmailSentAt).not.toBeNull();
      expect(row.invitationEmailLastError).toBeNull();

      token = magicLinkTokenFromLastMail();
      const expiresAt = await getVerificationExpiresAt(token);
      expect(Math.abs(expiresAt.getTime() - respondBy.getTime())).toBeLessThan(
        5000,
      );
    } finally {
      signInSpy.mockRestore();
      if (token) await deleteVerification(token);
      await deleteResponse(waveId);
    }
  });

  test('magic-link lifetime uses remaining time until respondBy after delayed processing', async () => {
    vi.mocked(sendMail).mockClear();
    const respondBy = new Date(Date.now() + 90 * 60 * 1000);

    const { responseId, waveId } = await createResponse({ respondBy });

    let token: string | undefined;
    try {
      const outcome = await processRsvpInvitation(responseId, 1);
      expect(outcome).toBe('sent');

      token = magicLinkTokenFromLastMail();
      const expiresAt = await getVerificationExpiresAt(token);
      expect(Math.abs(expiresAt.getTime() - respondBy.getTime())).toBeLessThan(
        5000,
      );
      expect(expiresAt.getTime()).toBeLessThan(
        Date.now() + 48 * 60 * 60 * 1000,
      );
    } finally {
      if (token) await deleteVerification(token);
      await deleteResponse(waveId);
    }
  });

  test('does not resend when the response is already sent', async () => {
    vi.mocked(sendMail).mockClear();
    const signInSpy = vi.spyOn(auth.api, 'signInMagicLink');

    const { responseId, waveId } = await createResponse({
      respondBy: new Date('2099-08-01T23:59:59.000Z'),
      invitationEmailStatus: 'sent',
    });

    try {
      const outcome = await processRsvpInvitation(responseId, 1);
      expect(outcome).toBe('already_sent');
      expect(signInSpy).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      signInSpy.mockRestore();
      await deleteResponse(waveId);
    }
  });

  test('redelivery of an already-sent message does not resend or overwrite state', async () => {
    vi.mocked(sendMail).mockClear();

    const { responseId, waveId } = await createResponse({
      respondBy: new Date('2099-08-01T23:59:59.000Z'),
      invitationEmailStatus: 'sent',
    });
    const before = await getResponse(responseId);

    try {
      // Simulate a redelivery of a message the consumer already handled.
      const outcome = await processRsvpInvitation(responseId, 3);
      expect(outcome).toBe('already_sent');
      expect(sendMail).not.toHaveBeenCalled();

      const after = await getResponse(responseId);
      expect(after.invitationEmailSentAt).toEqual(before.invitationEmailSentAt);
    } finally {
      await deleteResponse(waveId);
    }
  });

  test('acks a message whose response row no longer exists', async () => {
    const outcome = await processRsvpInvitation(
      '00000000-0000-0000-0000-000000000000',
      1,
    );
    expect(outcome).toBe('not_found');
  });

  test('skips sending when the RSVP is no longer pending (already decided)', async () => {
    vi.mocked(sendMail).mockClear();

    const { responseId, waveId } = await createResponse({
      respondBy: new Date('2099-08-01T23:59:59.000Z'),
      statusLabel: 'accepted',
    });

    try {
      const outcome = await processRsvpInvitation(responseId, 1);
      expect(outcome).toBe('not_pending');
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      await deleteResponse(waveId);
    }
  });

  test('skips sending when the RSVP window has already expired', async () => {
    vi.mocked(sendMail).mockClear();

    const { responseId, waveId } = await createResponse({
      respondBy: new Date('2020-01-01T00:00:00.000Z'),
      statusLabel: 'pending',
    });

    try {
      const outcome = await processRsvpInvitation(responseId, 1);
      expect(outcome).toBe('not_pending');
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      await deleteResponse(waveId);
    }
  });

  test('records the error and rethrows when a delivery attempt fails and retries remain', async () => {
    vi.mocked(sendMail).mockClear();
    const signInSpy = vi
      .spyOn(auth.api, 'signInMagicLink')
      .mockImplementationOnce(async () => {
        throw new Error('magic link unavailable');
      });

    const { responseId, waveId } = await createResponse({
      respondBy: new Date('2099-08-01T23:59:59.000Z'),
    });

    try {
      await expect(
        processRsvpInvitation(responseId, MAX_INVITATION_DELIVERY_ATTEMPTS - 1),
      ).rejects.toThrow('magic link unavailable');

      const row = await getResponse(responseId);
      expect(row.invitationEmailAttempts).toBe(1);
      expect(row.invitationEmailLastError).toContain('magic link unavailable');
      expect(row.invitationEmailStatus).toBe('queued');
    } finally {
      signInSpy.mockRestore();
      await deleteResponse(waveId);
    }
  });

  test('gives up and marks the response failed after the max delivery attempts', async () => {
    vi.mocked(sendMail).mockClear();
    const signInSpy = vi
      .spyOn(auth.api, 'signInMagicLink')
      .mockImplementationOnce(async () => {
        throw new Error('magic link unavailable');
      });

    const { responseId, waveId } = await createResponse({
      respondBy: new Date('2099-08-01T23:59:59.000Z'),
    });

    try {
      const outcome = await processRsvpInvitation(
        responseId,
        MAX_INVITATION_DELIVERY_ATTEMPTS,
      );
      expect(outcome).toBe('given_up');

      const row = await getResponse(responseId);
      expect(row.invitationEmailStatus).toBe('failed');
      expect(row.invitationEmailAttempts).toBe(1);
      expect(row.invitationEmailLastError).toContain('magic link unavailable');
    } finally {
      signInSpy.mockRestore();
      await deleteResponse(waveId);
    }
  });
});
