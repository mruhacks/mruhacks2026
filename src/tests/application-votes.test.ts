import { describe, test, expect, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import {
  eventParticipants,
  events,
  participationStatuses,
  teamMembers,
  teams,
  user,
} from '@/db/schema';
import {
  castApplicationVote,
  getReviewQueue,
  retractApplicationVote,
} from '@/lib/application-votes';
import { getWaitlist, syncWaitlistForEvent } from '@/lib/rsvp/waitlist';
import { voteOnApplication } from '@/app/dashboard/admin/events/review-actions';
import { insertParticipant, statusId } from '@/tests/participation-fixtures';
import type { ApplicationQuestion } from '@/types/application';
import type { ParticipationStatus } from '@/types/lookups';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({ updateTag: vi.fn() }));

import { getUser } from '@/utils/auth';

const createdEventIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  await db.delete(events).where(inArray(events.id, createdEventIds));
  await db.delete(user).where(inArray(user.id, createdUserIds));
});

let counter = 0;
async function createUser(name: string): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({
      name,
      email: `votes-${Date.now()}-${counter++}@example.com`,
      emailVerified: true,
    })
    .returning({ id: user.id });
  createdUserIds.push(row.id);
  return row.id;
}

async function createEvent(): Promise<string> {
  const [event] = await db
    .insert(events)
    .values({ name: 'Vote Test', hasApplication: true })
    .returning({ id: events.id });
  createdEventIds.push(event.id);
  return event.id;
}

async function applicant(
  eventId: string,
  name: string,
  status: ParticipationStatus = 'pending_review',
  responses: Record<string, unknown> = {},
) {
  const userId = await createUser(name);
  const participantId = await insertParticipant({
    eventId,
    userId,
    status,
    responses,
  });
  return { userId, participantId };
}

async function statusOf(participantId: string): Promise<string> {
  const [row] = await db
    .select({ label: participationStatuses.label })
    .from(eventParticipants)
    .innerJoin(
      participationStatuses,
      eq(eventParticipants.statusId, participationStatuses.id),
    )
    .where(eq(eventParticipants.id, participantId));
  return row.label;
}

async function makeTeam(
  eventId: string,
  members: { userId: string }[],
): Promise<void> {
  const [team] = await db
    .insert(teams)
    .values({
      eventId,
      organizerId: members[0].userId,
      code: `T${counter++}`.padEnd(8, '0').slice(0, 8),
    })
    .returning({ id: teams.id });
  await db
    .insert(teamMembers)
    .values(
      members.map((m) => ({ teamId: team.id, userId: m.userId, eventId })),
    );
}

async function setStatus(participantId: string, status: ParticipationStatus) {
  await db
    .update(eventParticipants)
    .set({ statusId: await statusId(status) })
    .where(eq(eventParticipants.id, participantId));
}

const vote = (
  eventId: string,
  participantId: string,
  voterId: string,
  approve: boolean,
) => castApplicationVote({ eventId, participantId, voterId, approve });

describe('castApplicationVote', () => {
  test('a no keeps an applicant in review; the first yes waitlists them', async () => {
    const eventId = await createEvent();
    const [r1, r2] = [await createUser('R1'), await createUser('R2')];
    const a = await applicant(eventId, 'A');

    expect(await vote(eventId, a.participantId, r1, false)).toEqual({
      success: true,
      status: 'pending_review',
    });
    expect(await statusOf(a.participantId)).toBe('pending_review');

    expect(await vote(eventId, a.participantId, r2, true)).toEqual({
      success: true,
      status: 'waitlisted',
    });
    expect(await statusOf(a.participantId)).toBe('waitlisted');
  });

  test('ranks the waitlist by approval ratio', async () => {
    const eventId = await createEvent();
    const reviewers = [
      await createUser('R1'),
      await createUser('R2'),
      await createUser('R3'),
    ];
    const low = await applicant(eventId, 'Low');
    const high = await applicant(eventId, 'High');

    // Low: 1 yes / 2 no. High: 2 yes / 1 no.
    await vote(eventId, low.participantId, reviewers[0], true);
    await vote(eventId, low.participantId, reviewers[1], false);
    await vote(eventId, low.participantId, reviewers[2], false);
    await vote(eventId, high.participantId, reviewers[0], false);
    await vote(eventId, high.participantId, reviewers[1], true);
    await vote(eventId, high.participantId, reviewers[2], true);

    const waitlist = await getWaitlist(eventId);
    expect(waitlist.map((e) => e.name)).toEqual(['High', 'Low']);
  });

  test("a team ranks by its top member's score", async () => {
    const eventId = await createEvent();
    const [r1, r2] = [await createUser('R1'), await createUser('R2')];
    const solo = await applicant(eventId, 'Solo');
    const weak = await applicant(eventId, 'Weak');
    const star = await applicant(eventId, 'Star');
    await makeTeam(eventId, [star, weak]);

    // Solo 1/2, Weak 1/2, Star 2/2.
    await vote(eventId, solo.participantId, r1, true);
    await vote(eventId, solo.participantId, r2, false);
    await vote(eventId, weak.participantId, r1, true);
    await vote(eventId, weak.participantId, r2, false);
    await vote(eventId, star.participantId, r1, true);
    await vote(eventId, star.participantId, r2, true);

    const names = (await getWaitlist(eventId)).map((e) => e.name);
    // Weak rides Star's score above Solo, and stays next to Star.
    expect(names.slice(0, 2).sort()).toEqual(['Star', 'Weak']);
    expect(names[2]).toBe('Solo');
  });

  test('a yes drags pending teammates along, but never a denied one', async () => {
    const eventId = await createEvent();
    const reviewer = await createUser('R');
    const star = await applicant(eventId, 'Star');
    const mate = await applicant(eventId, 'Mate');
    const denied = await applicant(eventId, 'Denied', 'denied');
    await makeTeam(eventId, [star, mate, denied]);

    await vote(eventId, star.participantId, reviewer, true);
    expect(await statusOf(mate.participantId)).toBe('waitlisted');
    expect(await statusOf(denied.participantId)).toBe('denied');
  });

  test("a denied member's yeses don't lift their team", async () => {
    const eventId = await createEvent();
    const [r1, r2] = [await createUser('R1'), await createUser('R2')];
    const star = await applicant(eventId, 'Star');
    const mate = await applicant(eventId, 'Mate');
    const solo = await applicant(eventId, 'Solo');
    await makeTeam(eventId, [star, mate]);

    // Star 2/2 would carry Mate (1/2) above Solo (1/1)...
    await vote(eventId, star.participantId, r1, true);
    await vote(eventId, star.participantId, r2, true);
    await vote(eventId, mate.participantId, r1, true);
    await vote(eventId, mate.participantId, r2, false);
    await vote(eventId, solo.participantId, r1, true);
    expect((await getWaitlist(eventId)).map((e) => e.name)).toEqual([
      'Star',
      'Mate',
      'Solo',
    ]);

    // ...until Star is denied: Mate ranks on their own score.
    await setStatus(star.participantId, 'denied');
    expect((await getWaitlist(eventId)).map((e) => e.name)).toEqual([
      'Solo',
      'Mate',
    ]);
  });

  test('joining a team with a yes later brings the joiner along', async () => {
    const eventId = await createEvent();
    const reviewer = await createUser('R');
    const star = await applicant(eventId, 'Star');
    const late = await applicant(eventId, 'Late');
    await vote(eventId, star.participantId, reviewer, true);
    expect(await statusOf(late.participantId)).toBe('pending_review');

    await makeTeam(eventId, [star, late]);
    await syncWaitlistForEvent(eventId);
    expect(await statusOf(late.participantId)).toBe('waitlisted');
  });

  test("a late joiner ranks at their new team's score", async () => {
    const eventId = await createEvent();
    const [r1, r2] = [await createUser('R1'), await createUser('R2')];
    const star = await applicant(eventId, 'Star');
    const solo = await applicant(eventId, 'Solo');
    const late = await applicant(eventId, 'Late');

    // Star 2/2, Solo 1/1, Late 1/2 — all already waitlisted on their own.
    await vote(eventId, star.participantId, r1, true);
    await vote(eventId, star.participantId, r2, true);
    await vote(eventId, solo.participantId, r1, true);
    await vote(eventId, late.participantId, r1, true);
    await vote(eventId, late.participantId, r2, false);
    const names = async () => (await getWaitlist(eventId)).map((e) => e.name);
    expect(await names()).toEqual(['Star', 'Solo', 'Late']);

    // Joining Star's team lifts Late to Star's score, right beside Star.
    await makeTeam(eventId, [star, late]);
    expect(await names()).toEqual(['Star', 'Late', 'Solo']);
  });

  test('refuses decided applications and your own', async () => {
    const eventId = await createEvent();
    const reviewer = await createUser('R');
    const invited = await applicant(eventId, 'Invited', 'denied');
    expect(await vote(eventId, invited.participantId, reviewer, true)).toEqual({
      success: false,
      error: 'This application has already been decided.',
    });

    const self = await applicant(eventId, 'Self');
    expect(await vote(eventId, self.participantId, self.userId, true)).toEqual({
      success: false,
      error: "You can't review your own application.",
    });
  });

  test('a no on someone waitlisted by hand leaves them waitlisted', async () => {
    const eventId = await createEvent();
    const reviewer = await createUser('R');
    const manual = await applicant(eventId, 'Manual', 'waitlisted');
    await vote(eventId, manual.participantId, reviewer, false);
    expect(await statusOf(manual.participantId)).toBe('waitlisted');
  });
});

describe('retractApplicationVote', () => {
  test('undoing the only yes returns the applicant to review', async () => {
    const eventId = await createEvent();
    const [r1, r2] = [await createUser('R1'), await createUser('R2')];
    const a = await applicant(eventId, 'A');

    await vote(eventId, a.participantId, r1, true);
    await vote(eventId, a.participantId, r2, true);
    expect(
      await retractApplicationVote({
        eventId,
        participantId: a.participantId,
        voterId: r1,
      }),
    ).toEqual({ success: true, status: 'waitlisted' });

    expect(
      await retractApplicationVote({
        eventId,
        participantId: a.participantId,
        voterId: r2,
      }),
    ).toEqual({ success: true, status: 'pending_review' });
    expect(await statusOf(a.participantId)).toBe('pending_review');
    expect(await getWaitlist(eventId)).toEqual([]);
  });

  test('undoing the last yes sends the dragged-along team back too', async () => {
    const eventId = await createEvent();
    const reviewer = await createUser('R');
    const a = await applicant(eventId, 'A');
    const b = await applicant(eventId, 'B');
    await makeTeam(eventId, [a, b]);

    await vote(eventId, a.participantId, reviewer, true);
    expect(await statusOf(b.participantId)).toBe('waitlisted');

    await retractApplicationVote({
      eventId,
      participantId: a.participantId,
      voterId: reviewer,
    });
    expect(await statusOf(a.participantId)).toBe('pending_review');
    expect(await statusOf(b.participantId)).toBe('pending_review');
  });
});

describe('getReviewQueue', () => {
  const questions: ApplicationQuestion[] = [
    {
      id: 'q-shown',
      label: 'Why?',
      type: 'long_text',
      required: true,
      order: 1,
      active: true,
      showInApplicationReview: true,
    },
    {
      id: 'q-hidden',
      label: 'Phone',
      type: 'short_text',
      required: true,
      order: 0,
      active: true,
    },
  ];

  test('serves only review-tagged answers, skipping voted, decided and own', async () => {
    const eventId = await createEvent();
    const reviewer = await applicant(eventId, 'Reviewer');
    const fresh = await applicant(eventId, 'Fresh', 'pending_review', {
      'q-shown': 'Because',
      'q-hidden': '555-0100',
    });
    const voted = await applicant(eventId, 'Voted');
    await applicant(eventId, 'Denied', 'denied');
    await vote(eventId, voted.participantId, reviewer.userId, false);

    const queue = await getReviewQueue({
      eventId,
      voterId: reviewer.userId,
      questions,
      limit: 10,
    });

    expect(queue.cards.map((c) => c.participantId)).toEqual([
      fresh.participantId,
    ]);
    expect(queue.cards[0].answers).toEqual([
      expect.objectContaining({ questionId: 'q-shown', value: 'Because' }),
    ]);
    expect(JSON.stringify(queue.cards)).not.toContain('555-0100');
    expect(queue).toMatchObject({ remaining: 1, reviewed: 1 });
  });
});

describe('voteOnApplication', () => {
  test('requires application:vote:all', async () => {
    const eventId = await createEvent();
    const a = await applicant(eventId, 'A');
    const outsider = await createUser('Outsider');
    vi.mocked(getUser).mockResolvedValue({ id: outsider } as never);

    const result = await voteOnApplication({
      eventId,
      participantId: a.participantId,
      approve: true,
    });
    expect(result.success).toBe(false);
    expect(await statusOf(a.participantId)).toBe('pending_review');
  });
});
