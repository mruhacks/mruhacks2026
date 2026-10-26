import { describe, test, expect, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import * as Rsvp from '@/lib/rsvp/server';
import { insertParticipant, insertVotes } from '@/tests/participation-fixtures';

const createdEventIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  await db.delete(schema.events).where(inArray(schema.events.id, createdEventIds));
  await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
});

let counter = 0;
async function createUser(name: string): Promise<string> {
  const [row] = await db
    .insert(schema.user)
    .values({
      name,
      email: `waitlist-${Date.now()}-${counter++}@example.com`,
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  createdUserIds.push(row.id);
  return row.id;
}

/**
 * A waitlist where votes rank A (2 yes) above B (1 yes, 1 no), then the
 * unvoted C (older) and D, plus a pending applicant who isn't on it.
 */
async function setup() {
  const [event] = await db
    .insert(schema.events)
    .values({ name: 'Waitlist Test', hasApplication: true })
    .returning({ id: schema.events.id });
  createdEventIds.push(event.id);
  const add = async (name: string, day: number) =>
    insertParticipant({
      eventId: event.id,
      userId: await createUser(name),
      status: 'waitlisted',
      createdAt: new Date(Date.UTC(2026, 0, day)),
    });
  const ids = {
    A: await add('A', 5),
    B: await add('B', 6),
    C: await add('C', 1),
    D: await add('D', 2),
  };
  await insertParticipant({
    eventId: event.id,
    userId: await createUser('Pending'),
    status: 'pending_review',
  });
  const voters = [await createUser('R1'), await createUser('R2')];
  await insertVotes({
    eventId: event.id,
    participantId: ids.A,
    voterIds: voters,
    approve: true,
  });
  await insertVotes({
    eventId: event.id,
    participantId: ids.B,
    voterIds: [voters[0]],
    approve: true,
  });
  await insertVotes({
    eventId: event.id,
    participantId: ids.B,
    voterIds: [voters[1]],
    approve: false,
  });
  return { eventId: event.id };
}

describe('getWaitlist', () => {
  test('lists only waitlisted participants, in the order waves invite them', async () => {
    const { eventId } = await setup();
    const waitlist = await Rsvp.getWaitlist(eventId);
    expect(waitlist.map((e) => [e.name, e.position])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
      ['D', 4],
    ]);

    const eligibility = await Rsvp.getEligibleRsvpApplicants(eventId);
    const waveOrder = Rsvp.selectRsvpWaveInvitees(eligibility!.applicants, null);
    expect(waveOrder.map((a) => a.participantId)).toEqual(waitlist.map((e) => e.participantId));
  });
});
