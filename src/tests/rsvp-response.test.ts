import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import {
  user,
  events,
  eventTerms,
  eventRsvpWaves,
  eventInvitations,
  checkIns,
} from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import { revalidatePath, updateTag } from 'next/cache';
import { eventApplicationsCacheTag } from '@/lib/admin-event';
import {
  getUserParticipation,
  getEventsWithUserStatus,
  submitRsvpResponse,
  withdrawParticipation,
} from '@/app/dashboard/events/actions';
import { EVENT_AT_CAPACITY_MESSAGE } from '@/lib/rsvp/constants';
import { timeoutExpiredInvitations } from '@/lib/rsvp/timeout-expired-invitations';
import type { ParticipationStatus } from '@/types/lookups';
import {
  countAccepted,
  getStatus,
  insertInvitation,
  insertParticipant,
} from '@/tests/participation-fixtures';

let testUserId: string;
const createdEventIds: string[] = [];

const FUTURE = new Date('2099-10-01T23:59:59.000Z');
const PAST = new Date('2020-01-01T00:00:00.000Z');

function mockSession(userId: string, name: string, email: string) {
  vi.mocked(getUser).mockResolvedValue({
    id: userId,
    name,
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
  } as Awaited<ReturnType<typeof getUser>>);
}

function restoreDefaultSession() {
  mockSession(testUserId, 'RSVP Responder', 'rsvp-responder@example.com');
}

/** A fresh application event with one wave and the test user invited in it. */
async function setupInvited(
  options: {
    name?: string;
    capacity?: number | null;
    respondBy?: Date;
    status?: Extract<
      ParticipationStatus,
      'invited' | 'accepted' | 'declined' | 'timed_out'
    >;
    userId?: string;
    hasApplication?: boolean;
    endsAt?: Date | null;
  } = {},
) {
  const [event] = await db
    .insert(events)
    .values({
      name: options.name ?? 'RSVP Response Test Event',
      hasApplication: options.hasApplication ?? true,
      capacity: options.capacity ?? null,
      endsAt: options.endsAt ?? null,
    })
    .returning({ id: events.id });
  createdEventIds.push(event.id);
  const [wave] = await db
    .insert(eventRsvpWaves)
    .values({
      eventId: event.id,
      wave: 1,
      respondBy: options.respondBy ?? FUTURE,
    })
    .returning({ id: eventRsvpWaves.id });
  const { participantId, invitationId } = await insertInvitation({
    rsvpWaveId: wave.id,
    eventId: event.id,
    userId: options.userId ?? testUserId,
    status: options.status ?? 'invited',
  });
  return { eventId: event.id, waveId: wave.id, participantId, invitationId };
}

async function getInvitation(invitationId: string) {
  const [row] = await db
    .select()
    .from(eventInvitations)
    .where(eq(eventInvitations.id, invitationId));
  return row;
}

beforeAll(async () => {
  const [userRow] = await db
    .insert(user)
    .values({
      name: 'RSVP Responder',
      email: 'rsvp-responder@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  testUserId = userRow.id;
  restoreDefaultSession();
});

afterAll(async () => {
  for (const id of createdEventIds) {
    await db.delete(events).where(eq(events.id, id));
  }
  await db.delete(user).where(eq(user.id, testUserId));
});

describe('getUserParticipation', () => {
  test('returns the participant status and invitation deadline', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited();
    const participation = await getUserParticipation(eventId);

    expect(participation?.status).toBe('invited');
    expect(participation?.display.title).toBe('RSVP required');
    expect(participation?.invitation?.respondBy).toEqual(FUTURE);
    expect(participation?.invitation?.respondedAt).toBeNull();
  });

  test('returns null when the user has not applied or registered', async () => {
    const { eventId } = await setupInvited();
    mockSession(
      '00000000-0000-0000-0000-000000000099',
      'Nobody',
      'nobody@example.com',
    );
    expect(await getUserParticipation(eventId)).toBeNull();
    restoreDefaultSession();
  });

  test('an application without an invitation has no invitation details', async () => {
    restoreDefaultSession();
    const [event] = await db
      .insert(events)
      .values({ name: 'Waitlisted Only', hasApplication: true })
      .returning({ id: events.id });
    createdEventIds.push(event.id);
    await insertParticipant({
      eventId: event.id,
      userId: testUserId,
      status: 'waitlisted',
    });

    const participation = await getUserParticipation(event.id);
    expect(participation?.status).toBe('waitlisted');
    expect(participation?.invitation).toBeNull();
  });

  test('treats a stored invited with an expired deadline as timed_out without persisting', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited({ respondBy: PAST });

    expect((await getUserParticipation(eventId))?.status).toBe('timed_out');
    expect(await getStatus(eventId, testUserId)).toBe('invited');
  });

  test.each(['accepted', 'declined'] as const)(
    '%s with an expired deadline stays %s',
    async (status) => {
      restoreDefaultSession();
      const { eventId } = await setupInvited({ respondBy: PAST, status });
      expect((await getUserParticipation(eventId))?.status).toBe(status);
    },
  );
});

describe('submitRsvpResponse', () => {
  test('accepts an open invitation, sets responded_at, and takes a spot', async () => {
    restoreDefaultSession();
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(updateTag).mockClear();
    const { eventId, invitationId } = await setupInvited();

    const result = await submitRsvpResponse(eventId, 'accepted');
    expect(result.success).toBe(true);

    expect(await getStatus(eventId, testUserId)).toBe('accepted');
    expect((await getInvitation(invitationId)).respondedAt).toBeInstanceOf(
      Date,
    );
    expect(await countAccepted(eventId)).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/events/${eventId}`);
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
    expect(updateTag).toHaveBeenCalledWith(eventApplicationsCacheTag(eventId));
  });

  test('rejects a second response without changing anything', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited();
    expect((await submitRsvpResponse(eventId, 'accepted')).success).toBe(true);

    for (const decision of ['accepted', 'declined'] as const) {
      const result = await submitRsvpResponse(eventId, decision);
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('Already responded'),
      });
    }
    expect(await getStatus(eventId, testUserId)).toBe('accepted');
    expect(await countAccepted(eventId)).toBe(1);
  });

  test('rejects reserved statuses such as timed_out', async () => {
    restoreDefaultSession();
    const { eventId, invitationId } = await setupInvited();

    const result = await submitRsvpResponse(eventId, 'timed_out' as 'declined');
    expect(result).toMatchObject({
      success: false,
      error: expect.stringMatching(/invalid RSVP decision/i),
    });
    expect(await getStatus(eventId, testUserId)).toBe('invited');
    expect((await getInvitation(invitationId)).respondedAt).toBeNull();
  });

  test('refuses when there is no invitation', async () => {
    restoreDefaultSession();
    const [event] = await db
      .insert(events)
      .values({ name: 'No Invitation', hasApplication: true })
      .returning({ id: events.id });
    createdEventIds.push(event.id);
    await insertParticipant({
      eventId: event.id,
      userId: testUserId,
      status: 'waitlisted',
    });

    const result = await submitRsvpResponse(event.id, 'accepted');
    expect(result).toMatchObject({
      success: false,
      error: 'No RSVP invitation found.',
    });
    expect(await getStatus(event.id, testUserId)).toBe('waitlisted');
  });

  test('declines an open invitation without taking a spot', async () => {
    restoreDefaultSession();
    const { eventId, invitationId } = await setupInvited();

    const result = await submitRsvpResponse(eventId, 'declined');
    expect(result.success).toBe(true);

    const participation = await getUserParticipation(eventId);
    expect(participation?.status).toBe('declined');
    expect(participation?.invitation?.respondedAt).toBeInstanceOf(Date);
    expect((await getInvitation(invitationId)).respondedAt).toBeInstanceOf(
      Date,
    );
    expect(await countAccepted(eventId)).toBe(0);
  });

  test('rolls back the status change when the invitation update fails', async () => {
    restoreDefaultSession();
    const { eventId, invitationId } = await setupInvited();

    const originalTransaction = db.transaction.bind(db);
    const transactionSpy = vi
      .spyOn(db, 'transaction')
      .mockImplementationOnce(async (callback) => {
        return originalTransaction(async (tx) => {
          const originalUpdate = tx.update.bind(tx);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tx as any).update = (table: unknown) => {
            if (table === eventInvitations) {
              throw new Error('forced invitation update failure');
            }
            return originalUpdate(table as typeof eventInvitations);
          };
          return callback(tx);
        });
      });

    try {
      const result = await submitRsvpResponse(eventId, 'accepted');
      expect(result.success).toBe(false);
      expect(await getStatus(eventId, testUserId)).toBe('invited');
      expect((await getInvitation(invitationId)).respondedAt).toBeNull();
      expect(await countAccepted(eventId)).toBe(0);
    } finally {
      transactionSpy.mockRestore();
    }
  });

  test('accepts when spots are available under a capacity limit', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited({ capacity: 2 });
    expect((await submitRsvpResponse(eventId, 'accepted')).success).toBe(true);
    expect(await countAccepted(eventId)).toBe(1);
  });

  test('accepts the final available spot', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited({ capacity: 1 });
    expect((await submitRsvpResponse(eventId, 'accepted')).success).toBe(true);
    expect(await countAccepted(eventId)).toBe(1);
  });

  test('refuses accept when capacity is already full and leaves the invitation open', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited({ capacity: 1 });
    const [other] = await db
      .insert(user)
      .values({
        name: 'Spot Holder',
        email: 'rsvp-spot-holder@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    await insertParticipant({ eventId, userId: other.id, status: 'accepted' });

    try {
      const result = await submitRsvpResponse(eventId, 'accepted');
      expect(result).toMatchObject({
        success: false,
        error: EVENT_AT_CAPACITY_MESSAGE,
      });
      expect(await getStatus(eventId, testUserId)).toBe('invited');
      expect(await countAccepted(eventId)).toBe(1);

      // Declining still works on a full event.
      expect((await submitRsvpResponse(eventId, 'declined')).success).toBe(
        true,
      );
    } finally {
      await db.delete(user).where(eq(user.id, other.id));
    }
  });

  test('concurrent accepts cannot both claim the last spot', async () => {
    const [userA] = await db
      .insert(user)
      .values({
        name: 'Capacity Racer A',
        email: 'rsvp-capacity-racer-a@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id, name: user.name, email: user.email });
    const [userB] = await db
      .insert(user)
      .values({
        name: 'Capacity Racer B',
        email: 'rsvp-capacity-racer-b@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id, name: user.name, email: user.email });

    const { eventId, waveId } = await setupInvited({
      capacity: 1,
      userId: userA.id,
    });
    await insertInvitation({
      rsvpWaveId: waveId,
      eventId,
      userId: userB.id,
    });

    const sessions = [userA, userB].map((u) => ({
      ...u,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    }));
    vi.mocked(getUser).mockImplementation(async () => {
      const next = sessions.shift();
      if (!next) throw new Error('unexpected extra getUser call');
      return next as Awaited<ReturnType<typeof getUser>>;
    });

    try {
      const results = await Promise.all([
        submitRsvpResponse(eventId, 'accepted'),
        submitRsvpResponse(eventId, 'accepted'),
      ]);

      const failures = results.filter((result) => !result.success);
      expect(results.filter((result) => result.success)).toHaveLength(1);
      expect(failures).toHaveLength(1);
      if (!failures[0].success) {
        expect(failures[0].error).toBe(EVENT_AT_CAPACITY_MESSAGE);
      }
      expect(await countAccepted(eventId)).toBe(1);
      const statuses = [
        await getStatus(eventId, userA.id),
        await getStatus(eventId, userB.id),
      ].sort();
      expect(statuses).toEqual(['accepted', 'invited']);
    } finally {
      vi.mocked(getUser).mockReset();
      restoreDefaultSession();
      await db.delete(events).where(eq(events.id, eventId));
      await db.delete(user).where(eq(user.id, userA.id));
      await db.delete(user).where(eq(user.id, userB.id));
    }
  });
});

describe('withdrawParticipation', () => {
  test('gives up a confirmed spot, freeing it', async () => {
    restoreDefaultSession();
    const { eventId, invitationId } = await setupInvited({
      capacity: 1,
      status: 'accepted',
    });
    expect(await countAccepted(eventId)).toBe(1);

    const result = await withdrawParticipation(eventId);
    expect(result).toMatchObject({ success: true });
    expect(await getStatus(eventId, testUserId)).toBe('declined');
    expect(await countAccepted(eventId)).toBe(0);
    expect((await getInvitation(invitationId)).respondedAt).toBeInstanceOf(
      Date,
    );
  });

  test('leaves the waitlist', async () => {
    restoreDefaultSession();
    const [event] = await db
      .insert(events)
      .values({ name: 'Leave Waitlist', hasApplication: true })
      .returning({ id: events.id });
    createdEventIds.push(event.id);
    await insertParticipant({
      eventId: event.id,
      userId: testUserId,
      status: 'waitlisted',
      waitlistPosition: 3,
    });

    expect((await withdrawParticipation(event.id)).success).toBe(true);
    expect(await getStatus(event.id, testUserId)).toBe('declined');
  });

  test('refuses once checked in', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited({ status: 'accepted' });
    await db.insert(checkIns).values({ eventId, userId: testUserId });

    const result = await withdrawParticipation(eventId);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('checked in'),
    });
    expect(await getStatus(eventId, testUserId)).toBe('accepted');
  });

  test('refuses an open invitation — that goes through the RSVP', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited();
    expect((await withdrawParticipation(eventId)).success).toBe(false);
    expect(await getStatus(eventId, testUserId)).toBe('invited');
  });

  test('refuses once the event has ended', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited({ status: 'accepted', endsAt: PAST });
    const result = await withdrawParticipation(eventId);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('ended'),
    });
  });

  test('refuses for an event without an application', async () => {
    restoreDefaultSession();
    const [event] = await db
      .insert(events)
      .values({ name: 'Simple Signup', hasApplication: false })
      .returning({ id: events.id });
    createdEventIds.push(event.id);
    await insertParticipant({
      eventId: event.id,
      userId: testUserId,
      status: 'accepted',
      responses: null,
    });

    expect((await withdrawParticipation(event.id)).success).toBe(false);
    expect(await getStatus(event.id, testUserId)).toBe('accepted');
  });
});

describe('timeoutExpiredInvitations', () => {
  test('persists timed_out for expired invitations and blocks accept/decline', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited({ respondBy: PAST });

    for (const decision of ['accepted', 'declined'] as const) {
      const result = await submitRsvpResponse(eventId, decision);
      expect(result).toMatchObject({
        success: false,
        error: 'RSVP deadline has passed.',
      });
    }

    const { timedOutCount } = await timeoutExpiredInvitations({ eventId });
    expect(timedOutCount).toBe(1);
    expect(await getStatus(eventId, testUserId)).toBe('timed_out');
  });

  test('does not time out accepted or declined participants', async () => {
    restoreDefaultSession();
    const accepted = await setupInvited({ respondBy: PAST, status: 'accepted' });
    const declined = await setupInvited({ respondBy: PAST, status: 'declined' });

    await timeoutExpiredInvitations({ eventId: accepted.eventId });
    await timeoutExpiredInvitations({ eventId: declined.eventId });

    expect(await getStatus(accepted.eventId, testUserId)).toBe('accepted');
    expect(await getStatus(declined.eventId, testUserId)).toBe('declined');
  });

  test('is idempotent', async () => {
    restoreDefaultSession();
    const { eventId } = await setupInvited({ respondBy: PAST });
    expect((await timeoutExpiredInvitations({ eventId })).timedOutCount).toBe(
      1,
    );
    expect((await timeoutExpiredInvitations({ eventId })).timedOutCount).toBe(
      0,
    );
  });
});

describe('getEventsWithUserStatus', () => {
  test('reports each event with the effective participation status', async () => {
    restoreDefaultSession();
    const open = await setupInvited({ name: 'Listing Open Invite' });
    const expired = await setupInvited({
      name: 'Listing Expired Invite',
      respondBy: PAST,
    });

    const listed = await getEventsWithUserStatus();
    const byId = new Map(listed.map((e) => [e.id, e]));

    expect(byId.get(open.eventId)?.status).toBe('invited');
    expect(byId.get(open.eventId)?.statusDisplay?.title).toBe('RSVP required');
    // An expired invitation never reads as still open.
    expect(byId.get(expired.eventId)?.status).toBe('timed_out');
  });
});

describe('RSVP Event Terms consent', () => {
  async function inviteWithTerms() {
    restoreDefaultSession();
    const invited = await setupInvited({ name: 'Terms RSVP' });
    const [terms] = await db
      .insert(eventTerms)
      .values({ eventId: invited.eventId, markdown: '## Rules\nBe respectful.' })
      .returning();
    await db
      .update(events)
      .set({ termsId: terms.id })
      .where(eq(events.id, invited.eventId));
    return { ...invited, terms };
  }

  test('requires explicit consent to the current version and records only its ID and server time', async () => {
    const { eventId, terms, invitationId } = await inviteWithTerms();
    for (const consent of [
      undefined,
      { accepted: false, termsId: terms.id },
      { accepted: true, termsId: '00000000-0000-0000-0000-000000000000' },
    ]) {
      const result = await submitRsvpResponse(eventId, 'accepted', consent);
      expect(result.success).toBe(false);
      expect(await getStatus(eventId, testUserId)).toBe('invited');
      const stored = await getInvitation(invitationId);
      expect(stored.termsAcceptedAt).toBeNull();
      expect(stored.acceptedTermsId).toBeNull();
    }

    const before = Date.now();
    expect(
      (
        await submitRsvpResponse(eventId, 'accepted', {
          accepted: true,
          termsId: terms.id,
        })
      ).success,
    ).toBe(true);
    const stored = await getInvitation(invitationId);
    expect(stored.acceptedTermsId).toBe(terms.id);
    expect(stored.termsAcceptedAt).toEqual(stored.respondedAt);
    expect(stored.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.termsAcceptedAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await countAccepted(eventId)).toBe(1);

    // A retry neither succeeds nor rewrites the recorded consent.
    expect(
      (
        await submitRsvpResponse(eventId, 'accepted', {
          accepted: true,
          termsId: terms.id,
        })
      ).success,
    ).toBe(false);
    expect((await getInvitation(invitationId)).termsAcceptedAt).toEqual(
      stored.termsAcceptedAt,
    );

    // The recorded version survives a later edit.
    const [newVersion] = await db
      .insert(eventTerms)
      .values({ eventId, markdown: 'New rules after acceptance' })
      .returning();
    await db
      .update(events)
      .set({ termsId: newVersion.id })
      .where(eq(events.id, eventId));
    const [consentRecord] = await db
      .select({
        termsId: eventInvitations.acceptedTermsId,
        markdown: eventTerms.markdown,
      })
      .from(eventInvitations)
      .innerJoin(eventTerms, eq(eventInvitations.acceptedTermsId, eventTerms.id))
      .where(eq(eventInvitations.id, invitationId));
    expect(consentRecord).toEqual({
      termsId: terms.id,
      markdown: terms.markdown,
    });
  });

  test('rejects a previously displayed terms version after an edit', async () => {
    const { eventId, terms } = await inviteWithTerms();
    const [next] = await db
      .insert(eventTerms)
      .values({ eventId, markdown: 'Updated rules' })
      .returning();
    await db
      .update(events)
      .set({ termsId: next.id })
      .where(eq(events.id, eventId));

    const result = await submitRsvpResponse(eventId, 'accepted', {
      accepted: true,
      termsId: terms.id,
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('changed'),
    });
    expect(await countAccepted(eventId)).toBe(0);
    expect(
      (
        await submitRsvpResponse(eventId, 'accepted', {
          accepted: true,
          termsId: next.id,
        })
      ).success,
    ).toBe(true);
  });

  test('declining does not require or record consent', async () => {
    const { eventId, invitationId } = await inviteWithTerms();
    expect((await submitRsvpResponse(eventId, 'declined')).success).toBe(true);
    const stored = await getInvitation(invitationId);
    expect(stored.termsAcceptedAt).toBeNull();
    expect(stored.acceptedTermsId).toBeNull();
  });
});
