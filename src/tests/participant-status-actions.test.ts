import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  checkIns,
  eventInvitations,
  eventParticipants,
  eventRsvpWaves,
  events,
  permission,
  user,
  userPermission,
} from '@/db/schema';
import type { ParticipationStatus } from '@/types/lookups';
import {
  getStatus,
  insertInvitation,
  insertParticipant,
} from '@/tests/participation-fixtures';
import { getWaitlist } from '@/lib/rsvp/waitlist';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/rsvp/rsvp-invitation-queue', () => ({
  publishRsvpInvitation: vi.fn(),
}));
vi.mock('next/cache', () => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import { publishRsvpInvitation } from '@/lib/rsvp/rsvp-invitation-queue';
import { updateParticipantStatus } from '@/app/dashboard/admin/events/actions';

const createdUserIds: string[] = [];
const createdEventIds: string[] = [];

/** One organizer per permission set, so each test can act as the right one. */
const actors: Record<'reviewer' | 'rsvpManager' | 'both' | 'none', string> = {
  reviewer: '',
  rsvpManager: '',
  both: '',
  none: '',
};

async function createUser(name: string): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({
      name,
      email: `status-actions-${createdUserIds.length}-${Date.now()}@example.com`,
      emailVerified: true,
    })
    .returning({ id: user.id });
  createdUserIds.push(row.id);
  return row.id;
}

async function grant(userId: string, slug: string) {
  const [created] = await db
    .insert(permission)
    .values({ slug })
    .onConflictDoNothing()
    .returning({ id: permission.id });
  const permissionId =
    created?.id ??
    (
      await db
        .select({ id: permission.id })
        .from(permission)
        .where(eq(permission.slug, slug))
        .limit(1)
    )[0].id;
  await db
    .insert(userPermission)
    .values({ userId, permissionId })
    .onConflictDoNothing();
}

function actAs(actor: keyof typeof actors) {
  vi.mocked(getUser).mockResolvedValue({
    id: actors[actor],
    email: `${actor}@example.com`,
    name: actor,
    emailVerified: true,
  } as never);
}

async function createEvent(): Promise<string> {
  const [row] = await db
    .insert(events)
    .values({ name: 'Status Actions Event', hasApplication: true })
    .returning({ id: events.id });
  createdEventIds.push(row.id);
  return row.id;
}

async function applicant(status: ParticipationStatus) {
  const eventId = await createEvent();
  const userId = await createUser(`Applicant ${status}`);
  const participantId = await insertParticipant({ eventId, userId, status });
  return { eventId, userId, participantId };
}

async function invited(
  status: 'invited' | 'accepted' | 'declined' | 'timed_out',
  respondBy = new Date('2099-01-01T00:00:00.000Z'),
) {
  const eventId = await createEvent();
  const userId = await createUser(`Invitee ${status}`);
  const [wave] = await db
    .insert(eventRsvpWaves)
    .values({ eventId, wave: 1, respondBy })
    .returning({ id: eventRsvpWaves.id });
  const { participantId, invitationId } = await insertInvitation({
    rsvpWaveId: wave.id,
    eventId,
    userId,
    status,
  });
  return { eventId, userId, participantId, invitationId };
}

beforeAll(async () => {
  actors.reviewer = await createUser('Reviewer');
  actors.rsvpManager = await createUser('RSVP Manager');
  actors.both = await createUser('Both');
  actors.none = await createUser('Nobody');
  await grant(actors.reviewer, 'application:review:all');
  await grant(actors.rsvpManager, 'rsvp:write:all');
  await grant(actors.both, 'application:review:all');
  await grant(actors.both, 'rsvp:write:all');
});

afterAll(async () => {
  if (createdEventIds.length) {
    await db.delete(events).where(inArray(events.id, createdEventIds));
  }
  await db
    .delete(userPermission)
    .where(inArray(userPermission.userId, createdUserIds));
  await db.delete(user).where(inArray(user.id, createdUserIds));
});

describe('updateParticipantStatus — review decisions', () => {
  test('a reviewer accepts a pending application onto the waitlist and the review is recorded', async () => {
    actAs('reviewer');
    const { eventId, userId, participantId } =
      await applicant('pending_review');

    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'waitlisted',
    });
    expect(result).toEqual({ success: true, data: { status: 'waitlisted' } });
    expect(await getStatus(eventId, userId)).toBe('waitlisted');

    const [row] = await db
      .select({
        reviewedAt: eventParticipants.reviewedAt,
        reviewedBy: eventParticipants.reviewedBy,
      })
      .from(eventParticipants)
      .where(eq(eventParticipants.id, participantId));
    expect(row.reviewedAt).toBeInstanceOf(Date);
    expect(row.reviewedBy).toBe(actors.reviewer);
  });

  test('waitlisting by hand joins the queue in application order; leaving it drops them', async () => {
    actAs('reviewer');
    const eventId = await createEvent();
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      ids.push(
        await insertParticipant({
          eventId,
          userId: await createUser(`Waitlist ${i}`),
          status: 'pending_review',
          createdAt: new Date(Date.UTC(2026, 0, i + 1)),
        }),
      );
    }

    for (const participantId of ids) {
      await updateParticipantStatus({
        eventId,
        participantId,
        status: 'waitlisted',
      });
    }
    const queue = async () =>
      (await getWaitlist(eventId)).map((e) => e.participantId);
    expect(await queue()).toEqual(ids);

    await updateParticipantStatus({
      eventId,
      participantId: ids[0],
      status: 'denied',
    });
    expect(await queue()).toEqual([ids[1]]);
  });

  test('an RSVP-only organizer cannot make review decisions', async () => {
    actAs('rsvpManager');
    const { eventId, userId, participantId } =
      await applicant('pending_review');

    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'waitlisted',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('permission'),
    });
    expect(await getStatus(eventId, userId)).toBe('pending_review');
  });

  test('a waitlisted applicant can be accepted directly as an override', async () => {
    actAs('both');
    const { eventId, userId, participantId } = await applicant('waitlisted');
    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'accepted',
    });
    expect(result).toEqual({ success: true, data: { status: 'accepted' } });
    expect(await getStatus(eventId, userId)).toBe('accepted');
  });

  test('inviting needs an open wave', async () => {
    actAs('both');
    const { eventId, userId, participantId } = await applicant('waitlisted');
    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'invited',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('no open RSVP wave'),
    });
    expect(await getStatus(eventId, userId)).toBe('waitlisted');
  });

  test('inviting adds them to the open wave', async () => {
    actAs('both');
    const { eventId, userId, participantId } = await applicant('waitlisted');
    const [wave] = await db
      .insert(eventRsvpWaves)
      .values({
        eventId,
        wave: 1,
        respondBy: new Date('2099-01-01T00:00:00.000Z'),
      })
      .returning({ id: eventRsvpWaves.id });

    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'invited',
    });
    expect(result.success).toBe(true);
    expect(await getStatus(eventId, userId)).toBe('invited');
    const [invitation] = await db
      .select({
        id: eventInvitations.id,
        rsvpWaveId: eventInvitations.rsvpWaveId,
        invitationEmailStatus: eventInvitations.invitationEmailStatus,
      })
      .from(eventInvitations)
      .where(eq(eventInvitations.participantId, participantId));
    expect(invitation.rsvpWaveId).toBe(wave.id);
    // Their invitation email goes out like a wave's would.
    expect(publishRsvpInvitation).toHaveBeenCalledWith(invitation.id);
    expect(invitation.invitationEmailStatus).toBe('queued');
  });

  test('crossing between review and RSVP needs both permissions', async () => {
    actAs('reviewer');
    const { eventId, userId, participantId } = await applicant('waitlisted');
    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'accepted',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('permission'),
    });
    expect(await getStatus(eventId, userId)).toBe('waitlisted');
  });

  test('without either permission the action is refused outright', async () => {
    actAs('none');
    const { eventId, participantId } = await applicant('pending_review');
    await expect(
      updateParticipantStatus({ eventId, participantId, status: 'waitlisted' }),
    ).rejects.toThrow(/REDIRECT:\/forbidden/);
  });
});

describe('updateParticipantStatus — RSVP overrides', () => {
  test('sending an invited participant back to the waitlist withdraws the invitation', async () => {
    actAs('both');
    const { eventId, userId, participantId } = await invited('invited');

    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'waitlisted',
    });
    expect(result.success).toBe(true);
    expect(await getStatus(eventId, userId)).toBe('waitlisted');
    const invitations = await db
      .select({ id: eventInvitations.id })
      .from(eventInvitations)
      .where(eq(eventInvitations.participantId, participantId));
    expect(invitations).toHaveLength(0);
  });

  test('a reviewer without rsvp:write:all cannot override an RSVP', async () => {
    actAs('reviewer');
    const { eventId, userId, participantId } = await invited('invited');
    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'accepted',
    });
    expect(result.success).toBe(false);
    expect(await getStatus(eventId, userId)).toBe('invited');
  });

  test('accepting on someone’s behalf records responded_at but no terms consent', async () => {
    actAs('rsvpManager');
    const { eventId, userId, participantId, invitationId } =
      await invited('invited');

    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'accepted',
    });
    expect(result.success).toBe(true);
    expect(await getStatus(eventId, userId)).toBe('accepted');

    const [invitation] = await db
      .select()
      .from(eventInvitations)
      .where(eq(eventInvitations.id, invitationId));
    expect(invitation.respondedAt).toBeInstanceOf(Date);
    expect(invitation.acceptedTermsId).toBeNull();
    expect(invitation.termsAcceptedAt).toBeNull();
  });

  test('an expired invitation cannot be reopened without an open wave', async () => {
    actAs('rsvpManager');
    const { eventId, userId, participantId } = await invited(
      'timed_out',
      new Date('2020-01-01T00:00:00.000Z'),
    );
    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'invited',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('no open RSVP wave'),
    });
    expect(await getStatus(eventId, userId)).toBe('timed_out');
  });

  test('a checked-in participant cannot be moved off accepted', async () => {
    actAs('rsvpManager');
    const { eventId, userId, participantId } = await invited('accepted');
    await db.insert(checkIns).values({ eventId, userId });

    const result = await updateParticipantStatus({
      eventId,
      participantId,
      status: 'declined',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('checked in'),
    });
    expect(await getStatus(eventId, userId)).toBe('accepted');
  });

  test('refuses a participant from another event', async () => {
    actAs('both');
    const { participantId } = await applicant('pending_review');
    const otherEventId = await createEvent();
    const result = await updateParticipantStatus({
      eventId: otherEventId,
      participantId,
      status: 'waitlisted',
    });
    expect(result).toMatchObject({
      success: false,
      error: 'Application not found.',
    });
  });
});
