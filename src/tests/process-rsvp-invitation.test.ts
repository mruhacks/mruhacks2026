import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  events,
  eventRsvpResponses,
  eventRsvpWaves,
  rsvpStatuses,
  user,
} from '@/db/schema';
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
let statusIdByLabel: Record<string, number>;
let waveCounter = 0;

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

async function createResponse(options: {
  statusLabel?: string;
  respondBy: Date;
  invitationEmailStatus?: string;
  invitationEmailAttempts?: number;
}): Promise<{ responseId: string; waveId: string }> {
  waveCounter += 1;
  const [wave] = await db
    .insert(eventRsvpWaves)
    .values({
      eventId: testEventId,
      wave: waveCounter,
      respondBy: options.respondBy,
    })
    .returning({ id: eventRsvpWaves.id });

  const [response] = await db
    .insert(eventRsvpResponses)
    .values({
      rsvpWaveId: wave.id,
      userId: testUserId,
      statusId: statusIdByLabel[options.statusLabel ?? 'pending'],
      invitationEmailStatus: options.invitationEmailStatus ?? 'queued',
      invitationEmailAttempts: options.invitationEmailAttempts ?? 0,
    })
    .returning({ id: eventRsvpResponses.id });

  return { responseId: response.id, waveId: wave.id };
}

async function getResponse(responseId: string) {
  const [row] = await db
    .select()
    .from(eventRsvpResponses)
    .where(eq(eventRsvpResponses.id, responseId))
    .limit(1);
  return row;
}

async function deleteResponse(waveId: string): Promise<void> {
  // Cascades to the response row.
  await db.delete(eventRsvpWaves).where(eq(eventRsvpWaves.id, waveId));
}

beforeAll(async () => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';

  statusIdByLabel = {
    pending: await ensureRsvpStatus('pending', false),
    accepted: await ensureRsvpStatus('accepted', true),
    declined: await ensureRsvpStatus('declined', true),
    timed_out: await ensureRsvpStatus('timed_out', true),
  };

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

    const { responseId, waveId } = await createResponse({
      respondBy: new Date('2099-08-01T23:59:59.000Z'),
    });

    try {
      const outcome = await processRsvpInvitation(responseId, 1);
      expect(outcome).toBe('sent');
      expect(signInSpy).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledTimes(1);

      const row = await getResponse(responseId);
      expect(row.invitationEmailStatus).toBe('sent');
      expect(row.invitationEmailSentAt).not.toBeNull();
      expect(row.invitationEmailLastError).toBeNull();
    } finally {
      signInSpy.mockRestore();
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
