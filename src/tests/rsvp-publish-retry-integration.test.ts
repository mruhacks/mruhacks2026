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
import {
  applicationStatuses,
  events,
  eventApplications,
  eventRsvpResponses,
  eventRsvpWaves,
  rsvpStatuses,
  user,
} from '@/db/schema';
import { sendRsvpWave } from '@/lib/rsvp/send-rsvp-wave';
import { requeuePendingRsvpInvitations } from '@/lib/rsvp/requeue-pending-rsvp-invitations';

const FUTURE_RESPOND_BY = new Date('2099-08-01T23:59:59.000Z');

let testEventId: string;
let testUserId: string;
let approvedStatusId: number;
let pendingRsvpStatusId: number;

async function ensureStatus(
  table: typeof applicationStatuses | typeof rsvpStatuses,
  label: string,
  isFinal: boolean,
): Promise<number> {
  const [inserted] = await db
    .insert(table)
    .values({ label, title: label, description: label, variant: 'default', isFinal })
    .onConflictDoNothing()
    .returning({ id: table.id });
  if (inserted) return inserted.id;
  const [existing] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.label, label))
    .limit(1);
  return existing.id;
}

async function getResponseStatus(userId: string) {
  const [row] = await db
    .select({ invitationEmailStatus: eventRsvpResponses.invitationEmailStatus })
    .from(eventRsvpResponses)
    .where(eq(eventRsvpResponses.userId, userId))
    .limit(1);
  return row?.invitationEmailStatus;
}

beforeAll(async () => {
  approvedStatusId = await ensureStatus(applicationStatuses, 'approved', true);
  pendingRsvpStatusId = await ensureStatus(rsvpStatuses, 'pending', false);

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

  await db.insert(eventApplications).values({
    eventId: testEventId,
    userId: testUserId,
    statusId: approvedStatusId,
  });
});

afterAll(async () => {
  await db
    .delete(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, testEventId));
  await db
    .delete(eventApplications)
    .where(eq(eventApplications.eventId, testEventId));
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

    const result = await sendRsvpWave(testEventId, FUTURE_RESPOND_BY);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.invitationsQueued).toBe(1);
    expect(result.queueFailures).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await getResponseStatus(testUserId)).toBe('queued');
  }, 10_000);

  test('exhausting all publish attempts leaves the row unsent and reports the failure', async () => {
    await db
      .delete(eventRsvpWaves)
      .where(eq(eventRsvpWaves.eventId, testEventId));

    send.mockRejectedValue(new Error('queue down'));

    const result = await sendRsvpWave(testEventId, FUTURE_RESPOND_BY);

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
    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId: testEventId,
        wave: 999,
        respondBy: FUTURE_RESPOND_BY,
      })
      .returning({ id: eventRsvpWaves.id });

    const [response] = await db
      .insert(eventRsvpResponses)
      .values({
        rsvpWaveId: wave.id,
        userId: testUserId,
        statusId: pendingRsvpStatusId,
        invitationEmailStatus: 'unsent',
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      })
      .returning({ id: eventRsvpResponses.id });

    send
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce({ messageId: 'msg-sweep' });

    try {
      const result = await requeuePendingRsvpInvitations();

      expect(result.queued).toBe(1);
      expect(send).toHaveBeenCalledTimes(2);

      const [row] = await db
        .select({
          invitationEmailStatus: eventRsvpResponses.invitationEmailStatus,
        })
        .from(eventRsvpResponses)
        .where(eq(eventRsvpResponses.id, response.id))
        .limit(1);
      expect(row?.invitationEmailStatus).toBe('queued');
    } finally {
      await db.delete(eventRsvpWaves).where(eq(eventRsvpWaves.id, wave.id));
    }
  }, 10_000);
});
