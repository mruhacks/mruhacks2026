import { describe, test, expect, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import { events, user } from '@/db/schema';
import { getWaitlist, moveWaitlistEntry } from '@/lib/rsvp/waitlist';
import { selectRsvpWaveInvitees } from '@/lib/rsvp/select-rsvp-wave-invitees';
import { getEligibleRsvpApplicants } from '@/lib/rsvp/eligible-rsvp-applicants';
import { insertParticipant } from '@/tests/participation-fixtures';

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
      email: `waitlist-${Date.now()}-${counter++}@example.com`,
      emailVerified: true,
    })
    .returning({ id: user.id });
  createdUserIds.push(row.id);
  return row.id;
}

/** A waitlist of A(1), B(2), C(unranked, older), D(unranked) plus a non-waitlisted row. */
async function setup() {
  const [event] = await db
    .insert(events)
    .values({ name: 'Waitlist Test', hasApplication: true })
    .returning({ id: events.id });
  createdEventIds.push(event.id);
  const add = async (
    name: string,
    waitlistPosition: number | null,
    day: number,
  ) =>
    insertParticipant({
      eventId: event.id,
      userId: await createUser(name),
      status: 'waitlisted',
      waitlistPosition,
      createdAt: new Date(Date.UTC(2026, 0, day)),
    });
  const ids = {
    A: await add('A', 1, 5),
    B: await add('B', 2, 6),
    C: await add('C', null, 1),
    D: await add('D', null, 2),
  };
  await insertParticipant({
    eventId: event.id,
    userId: await createUser('Pending'),
    status: 'pending_review',
  });
  return { eventId: event.id, ids };
}

const names = async (eventId: string) =>
  (await getWaitlist(eventId)).map((entry) => entry.name);

describe('getWaitlist', () => {
  test('lists only waitlisted participants, in the order waves invite them', async () => {
    const { eventId } = await setup();
    const waitlist = await getWaitlist(eventId);
    expect(waitlist.map((e) => [e.name, e.position])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
      ['D', 4],
    ]);

    const eligibility = await getEligibleRsvpApplicants(eventId);
    const waveOrder = selectRsvpWaveInvitees(eligibility!.applicants, null);
    expect(waveOrder.map((a) => a.participantId)).toEqual(
      waitlist.map((e) => e.participantId),
    );
  });
});

describe('moveWaitlistEntry', () => {
  test('moves someone up, shifting the rest down, and ranks everyone', async () => {
    const { eventId, ids } = await setup();
    expect(await moveWaitlistEntry(eventId, ids.D, 1)).toEqual({
      success: true,
      from: 4,
      to: 1,
    });
    expect(await names(eventId)).toEqual(['D', 'A', 'B', 'C']);

    expect(await moveWaitlistEntry(eventId, ids.D, 3)).toMatchObject({
      success: true,
    });
    expect(await names(eventId)).toEqual(['A', 'B', 'D', 'C']);
  });

  test('clamps a position past the end to the back of the queue', async () => {
    const { eventId, ids } = await setup();
    expect(await moveWaitlistEntry(eventId, ids.A, 99)).toEqual({
      success: true,
      from: 1,
      to: 4,
    });
    expect(await names(eventId)).toEqual(['B', 'C', 'D', 'A']);
  });

  test('refuses someone who is not on the waitlist, and bad positions', async () => {
    const { eventId, ids } = await setup();
    expect(
      await moveWaitlistEntry(
        eventId,
        '00000000-0000-0000-0000-000000000000',
        1,
      ),
    ).toMatchObject({ success: false });
    expect(await moveWaitlistEntry(eventId, ids.A, 0)).toMatchObject({
      success: false,
    });
    expect(await names(eventId)).toEqual(['A', 'B', 'C', 'D']);
  });
});
