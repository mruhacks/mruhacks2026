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

// Mock only the underlying Vercel Queue SDK call, not the wrapper — this
// exercises the real publishRsvpInvitation retry logic end-to-end through
// both callers, proving they transparently benefit from it.
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@vercel/queue', () => ({ send }));

vi.mock('@/utils/mail', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { db } from '@/utils/db';
import {
  events,
  eventParticipants,
  eventInvitations,
  eventRsvpWaves,
  user,
} from '@/db/schema';
import {
  insertInvitation,
  insertParticipant,
  setStatus,
} from '@/tests/participation-fixtures';
import { sendRsvpWave } from '@/lib/rsvp/send-rsvp-wave';
import { requeuePendingRsvpInvitations } from '@/lib/rsvp/requeue-pending-rsvp-invitations';

const FUTURE_RESPOND_BY = new Date('2099-08-01T23:59:59.000Z');

let testEventId: string;
let testUserId: string;
async function getResponseStatus(userId: string) {
  const [row] = await db
    .select({ invitationEmailStatus: eventInvitations.invitationEmailStatus })
    .from(eventInvitations)
    .innerJoin(
      eventParticipants,
      eq(eventInvitations.participantId, eventParticipants.id),
    )
    .where(eq(eventParticipants.userId, userId))
    .limit(1);
  return row?.invitationEmailStatus;
}

/** Drops every wave (and invitation) and puts the applicant back in line. */
async function resetToWaitlisted() {
  await db
    .delete(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, testEventId));
  await setStatus(testEventId, testUserId, 'waitlisted');
}

beforeAll(async () => {
  const [eventRow] = await db
    .insert(events)
    .values({ name: 'Publish Retry Integration Event', hasApplication: true })
    .returning({ id: events.id });
  testEventId = eventRow.id;

  const [userRow] = await db
    .insert(user)
    .values({
      name: 'Publish Retry Applicant',
      email: 'publish-retry@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  testUserId = userRow.id;

  await insertParticipant({
    eventId: testEventId,
    userId: testUserId,
    status: 'waitlisted',
  });
});

afterAll(async () => {
  await db
    .delete(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, testEventId));
  await db.delete(events).where(eq(events.id, testEventId));
  await db.delete(user).where(eq(user.id, testUserId));
});

beforeEach(() => {
  send.mockReset();
});

describe('sendRsvpWave + publish retry integration', () => {
  test('a transient publish failure is retried and still ends up queued', async () => {
    send
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce({ messageId: 'msg-1' });

    const result = await sendRsvpWave(testEventId);

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

    const result = await sendRsvpWave(testEventId);

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
      .insert(eventRsvpWaves)
      .values({
        eventId: testEventId,
        wave: 999,
        respondBy: FUTURE_RESPOND_BY,
      })
      .returning({ id: eventRsvpWaves.id });

    const { invitationId } = await insertInvitation({
      rsvpWaveId: wave.id,
      eventId: testEventId,
      userId: testUserId,
      invitationEmailStatus: 'unsent',
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    const response = { id: invitationId };

    send
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce({ messageId: 'msg-sweep' });

    try {
      const result = await requeuePendingRsvpInvitations();

      expect(result.queued).toBe(1);
      expect(send).toHaveBeenCalledTimes(2);

      const [row] = await db
        .select({
          invitationEmailStatus: eventInvitations.invitationEmailStatus,
        })
        .from(eventInvitations)
        .where(eq(eventInvitations.id, response.id))
        .limit(1);
      expect(row?.invitationEmailStatus).toBe('queued');
    } finally {
      await db.delete(eventRsvpWaves).where(eq(eventRsvpWaves.id, wave.id));
    }
  }, 10_000);
});
