import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  events,
  eventRsvpResponses,
  eventRsvpWaves,
  rsvpStatuses,
  user,
} from '@/db/schema';

const { publishRsvpInvitation } = vi.hoisted(() => ({
  publishRsvpInvitation: vi.fn(),
}));
vi.mock('@/lib/rsvp/rsvp-invitation-queue', () => ({
  publishRsvpInvitation,
}));

import { requeuePendingRsvpInvitations } from '@/lib/rsvp/requeue-pending-rsvp-invitations';

const FUTURE_RESPOND_BY = new Date('2099-08-01T23:59:59.000Z');
const STALE_CREATED_AT = new Date(Date.now() - 10 * 60 * 1000);
const FRESH_CREATED_AT = new Date();

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
  invitationEmailStatus: string;
  createdAt: Date;
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
      invitationEmailStatus: options.invitationEmailStatus,
      createdAt: options.createdAt,
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
  statusIdByLabel = {
    pending: await ensureRsvpStatus('pending', false),
    accepted: await ensureRsvpStatus('accepted', true),
    declined: await ensureRsvpStatus('declined', true),
    timed_out: await ensureRsvpStatus('timed_out', true),
  };

  const [eventRow] = await db
    .insert(events)
    .values({ name: 'Reconciliation Sweep Test Event', hasApplication: true })
    .returning({ id: events.id });
  testEventId = eventRow.id;

  const [userRow] = await db
    .insert(user)
    .values({
      name: 'Reconciliation Sweep User',
      email: 'reconciliation-sweep@example.com',
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

beforeEach(() => {
  publishRsvpInvitation.mockReset();
  publishRsvpInvitation.mockResolvedValue({ messageId: 'msg-id' });
});

describe('requeuePendingRsvpInvitations', () => {
  test('republishes a stale unsent row and marks it queued', async () => {
    const { responseId, waveId } = await createResponse({
      respondBy: FUTURE_RESPOND_BY,
      invitationEmailStatus: 'unsent',
      createdAt: STALE_CREATED_AT,
    });

    try {
      const result = await requeuePendingRsvpInvitations();

      expect(result.inspected).toBe(1);
      expect(result.queued).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.publishFailures).toBe(0);
      expect(publishRsvpInvitation).toHaveBeenCalledWith(responseId);

      const row = await getResponse(responseId);
      expect(row.invitationEmailStatus).toBe('queued');
      expect(row.invitationEmailQueuedAt).not.toBeNull();
    } finally {
      await deleteResponse(waveId);
    }
  });

  test('ignores a recent unsent row younger than the safety threshold', async () => {
    const { responseId, waveId } = await createResponse({
      respondBy: FUTURE_RESPOND_BY,
      invitationEmailStatus: 'unsent',
      createdAt: FRESH_CREATED_AT,
    });

    try {
      const result = await requeuePendingRsvpInvitations();

      expect(result.inspected).toBe(0);
      expect(publishRsvpInvitation).not.toHaveBeenCalled();

      const row = await getResponse(responseId);
      expect(row.invitationEmailStatus).toBe('unsent');
    } finally {
      await deleteResponse(waveId);
    }
  });

  test('leaves the row unsent when the publish fails, without stopping other rows', async () => {
    const failing = await createResponse({
      respondBy: FUTURE_RESPOND_BY,
      invitationEmailStatus: 'unsent',
      createdAt: STALE_CREATED_AT,
    });
    const succeeding = await createResponse({
      respondBy: FUTURE_RESPOND_BY,
      invitationEmailStatus: 'unsent',
      createdAt: STALE_CREATED_AT,
    });

    publishRsvpInvitation.mockImplementation(async (responseId: string) => {
      if (responseId === failing.responseId) {
        throw new Error('queue unavailable');
      }
      return { messageId: 'msg-id' };
    });

    try {
      const result = await requeuePendingRsvpInvitations();

      expect(result.inspected).toBe(2);
      expect(result.queued).toBe(1);
      expect(result.publishFailures).toBe(1);

      const failingRow = await getResponse(failing.responseId);
      expect(failingRow.invitationEmailStatus).toBe('unsent');

      const succeedingRow = await getResponse(succeeding.responseId);
      expect(succeedingRow.invitationEmailStatus).toBe('queued');
    } finally {
      await deleteResponse(failing.waveId);
      await deleteResponse(succeeding.waveId);
    }
  });

  test.each(['legacy', 'queued', 'sent', 'failed'])(
    'ignores rows already in %s status',
    async (status) => {
      const { responseId, waveId } = await createResponse({
        respondBy: FUTURE_RESPOND_BY,
        invitationEmailStatus: status,
        createdAt: STALE_CREATED_AT,
      });

      try {
        const result = await requeuePendingRsvpInvitations();

        expect(result.inspected).toBe(0);
        expect(publishRsvpInvitation).not.toHaveBeenCalled();

        const row = await getResponse(responseId);
        expect(row.invitationEmailStatus).toBe(status);
      } finally {
        await deleteResponse(waveId);
      }
    },
  );

  test('skips a stale unsent row whose RSVP is no longer effectively pending', async () => {
    const { responseId, waveId } = await createResponse({
      statusLabel: 'accepted',
      respondBy: FUTURE_RESPOND_BY,
      invitationEmailStatus: 'unsent',
      createdAt: STALE_CREATED_AT,
    });

    try {
      const result = await requeuePendingRsvpInvitations();

      expect(result.inspected).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.queued).toBe(0);
      expect(publishRsvpInvitation).not.toHaveBeenCalled();

      const row = await getResponse(responseId);
      expect(row.invitationEmailStatus).toBe('unsent');
    } finally {
      await deleteResponse(waveId);
    }
  });

  test('skips a stale unsent row whose RSVP window has already expired', async () => {
    const { responseId, waveId } = await createResponse({
      respondBy: new Date('2020-01-01T00:00:00.000Z'),
      invitationEmailStatus: 'unsent',
      createdAt: STALE_CREATED_AT,
    });

    try {
      const result = await requeuePendingRsvpInvitations();

      expect(result.skipped).toBe(1);
      expect(publishRsvpInvitation).not.toHaveBeenCalled();

      const row = await getResponse(responseId);
      expect(row.invitationEmailStatus).toBe('unsent');
    } finally {
      await deleteResponse(waveId);
    }
  });

  test('never regresses a row a fast consumer already marked sent back to queued', async () => {
    const { responseId, waveId } = await createResponse({
      respondBy: FUTURE_RESPOND_BY,
      invitationEmailStatus: 'unsent',
      createdAt: STALE_CREATED_AT,
    });

    // Simulate the consumer racing ahead of the sweep: by the time
    // publishRsvpInvitation "returns", the message has already been
    // delivered, processed, and marked 'sent'.
    publishRsvpInvitation.mockImplementationOnce(async (id: string) => {
      await db
        .update(eventRsvpResponses)
        .set({
          invitationEmailStatus: 'sent',
          invitationEmailSentAt: new Date(),
        })
        .where(eq(eventRsvpResponses.id, id));
      return { messageId: 'msg-race' };
    });

    try {
      const result = await requeuePendingRsvpInvitations();
      expect(result.queued).toBe(1);

      const row = await getResponse(responseId);
      expect(row.invitationEmailStatus).toBe('sent');
    } finally {
      await deleteResponse(waveId);
    }
  });
});
