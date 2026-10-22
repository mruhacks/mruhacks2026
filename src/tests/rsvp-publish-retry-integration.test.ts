import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

// Mock only the underlying Vercel Queue SDK call, not the wrapper — this
// exercises the real publishRsvpInvitation retry logic end-to-end through
// both callers, proving they transparently benefit from it.
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@vercel/queue', () => ({ send }));

vi.mock('@/utils/mail', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import { insertInvitation, insertParticipant, setStatus } from '@/tests/participation-fixtures';
import * as Rsvp from '@/lib/rsvp/server';

const FUTURE_RESPOND_BY = new Date('2099-08-01T23:59:59.000Z');

let testEventId: string;
let testUserId: string;
async function getResponseStatus(userId: string) {
  const [row] = await db
    .select({ invitationEmailStatus: schema.eventInvitations.invitationEmailStatus })
    .from(schema.eventInvitations)
    .innerJoin(schema.eventParticipants, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
    .where(eq(schema.eventParticipants.userId, userId))
    .limit(1);
  return row?.invitationEmailStatus;
}

/** Drops every wave (and invitation) and puts the applicant back in line. */
async function resetToWaitlisted() {
  await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.eventId, testEventId));
  await setStatus(testEventId, testUserId, 'waitlisted');
}

beforeAll(async () => {
  const [eventRow] = await db
    .insert(schema.events)
    .values({ name: 'Publish Retry Integration Event', hasApplication: true })
    .returning({ id: schema.events.id });
  testEventId = eventRow.id;

  const [userRow] = await db
    .insert(schema.user)
    .values({
      name: 'Publish Retry Applicant',
      email: 'publish-retry@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  testUserId = userRow.id;

  await insertParticipant({
    eventId: testEventId,
    userId: testUserId,
    status: 'waitlisted',
  });
});

afterAll(async () => {
  await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.eventId, testEventId));
  await db.delete(schema.events).where(eq(schema.events.id, testEventId));
  await db.delete(schema.user).where(eq(schema.user.id, testUserId));
});

beforeEach(() => {
  send.mockReset();
});

describe('sendRsvpWave + publish retry integration', () => {
  test('a transient publish failure is retried and still ends up queued', async () => {
    send.mockRejectedValueOnce(new Error('queue unavailable')).mockResolvedValueOnce({ messageId: 'msg-1' });

    const result = await Rsvp.sendRsvpWave(testEventId);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.invitationsQueued).toBe(1);
    expect(result.queueFailures).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await getResponseStatus(testUserId)).toBe('queued');
  }, 10_000);

  test('exhausting all publish attempts leaves the row unsent and reports the failure', async () => {
    await resetToWaitlisted();

    send.mockRejectedValue(new Error('queue down'));

    const result = await Rsvp.sendRsvpWave(testEventId);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.invitationsQueued).toBe(0);
    expect(result.queueFailures).toHaveLength(1);
    expect(result.queueFailures[0]?.error).toContain('queue down');
    expect(send).toHaveBeenCalledTimes(3);
    expect(await getResponseStatus(testUserId)).toBe('unsent');
  }, 10_000);
});

describe('requeuePendingRsvpInvitations + publish retry integration', () => {
  test('a stale unsent row is retried and ends up queued after a transient failure', async () => {
    await resetToWaitlisted();
    const [wave] = await db
      .insert(schema.eventRsvpWaves)
      .values({
        eventId: testEventId,
        wave: 999,
        respondBy: FUTURE_RESPOND_BY,
      })
      .returning({ id: schema.eventRsvpWaves.id });

    const { invitationId } = await insertInvitation({
      rsvpWaveId: wave.id,
      eventId: testEventId,
      userId: testUserId,
      invitationEmailStatus: 'unsent',
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    const response = { id: invitationId };

    send.mockRejectedValueOnce(new Error('queue unavailable')).mockResolvedValueOnce({ messageId: 'msg-sweep' });

    try {
      const result = await Rsvp.requeuePendingRsvpInvitations();

      expect(result.queued).toBe(1);
      expect(send).toHaveBeenCalledTimes(2);

      const [row] = await db
        .select({
          invitationEmailStatus: schema.eventInvitations.invitationEmailStatus,
        })
        .from(schema.eventInvitations)
        .where(eq(schema.eventInvitations.id, response.id))
        .limit(1);
      expect(row?.invitationEmailStatus).toBe('queued');
    } finally {
      await db.delete(schema.eventRsvpWaves).where(eq(schema.eventRsvpWaves.id, wave.id));
    }
  }, 10_000);
});
