import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import { events, eventInvitations, eventRsvpWaves, user } from '@/db/schema';
import { insertInvitation } from '@/tests/participation-fixtures';

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

async function createResponse(options: {
  statusLabel?: keyof typeof STATUS_BY_LABEL;
  respondBy: Date;
  invitationEmailStatus: string;
  createdAt: Date;
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
    invitationEmailStatus: options.invitationEmailStatus,
    createdAt: options.createdAt,
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

beforeAll(async () => {
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
        .update(eventInvitations)
        .set({
          invitationEmailStatus: 'sent',
          invitationEmailSentAt: new Date(),
        })
        .where(eq(eventInvitations.id, id));
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
