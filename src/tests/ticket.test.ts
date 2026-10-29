/**
 * Tests for src/lib/ticket: who gets a pass, and the check-in rules on their
 * own — called with a plain actor id and a chosen `now`, no scanner session.
 * The scanner actions' auth and end-to-end behaviour live in
 * check-in-actions.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import * as schema from '@/db/schema';
import * as Ticket from '@/lib/ticket/server';
import { insertAttendees, insertParticipant } from '@/tests/participation-fixtures';
import { db } from '@/utils/db';

const HOUR = 3_600_000;
/** Mid-event: after the lunch slot opens, before it and the event end. */
const now = new Date('2026-03-07T12:30:00Z');
const at = (offset: number) => new Date(now.getTime() + offset);

let actorId: string;
let attendeeId: string;
let invitedId: string;
let eventId: string;
let lunchId: string;
let disabledEventId: string;
const users: string[] = [];
const events: string[] = [];

async function createUser(name: string): Promise<string> {
  const [row] = await db
    .insert(schema.user)
    .values({ name, email: `ticket-${name.toLowerCase().replace(/\W+/g, '-')}@test.dev`, emailVerified: true })
    .returning({ id: schema.user.id });
  users.push(row.id);
  return row.id;
}

async function createEvent(values: Partial<typeof schema.events.$inferInsert>): Promise<string> {
  const [row] = await db
    .insert(schema.events)
    .values({ name: 'Ticket Event', hasApplication: false, applicationQuestions: [], ...values })
    .returning({ id: schema.events.id });
  events.push(row.id);
  return row.id;
}

beforeAll(async () => {
  actorId = await createUser('Ticket Volunteer');
  attendeeId = await createUser('Ticket Attendee');
  invitedId = await createUser('Ticket Invited');

  eventId = await createEvent({ name: 'Ticket Hackathon', startsAt: at(-4 * HOUR), endsAt: at(24 * HOUR) });
  lunchId = await createEvent({ name: 'Ticket Lunch', parentEventId: eventId, startsAt: at(-HOUR), endsAt: at(HOUR) });
  disabledEventId = await createEvent({ name: 'Ticket No Check-in', checkInEnabled: false });

  await insertAttendees([
    { eventId, userId: attendeeId },
    { eventId: disabledEventId, userId: attendeeId },
  ]);
  await insertParticipant({ eventId, userId: invitedId, status: 'invited' });
});

afterAll(async () => {
  await db.delete(schema.checkIns).where(inArray(schema.checkIns.eventId, events));
  await db.delete(schema.eventParticipants).where(inArray(schema.eventParticipants.eventId, events));
  await db.delete(schema.events).where(inArray(schema.events.id, [...events].reverse()));
  await db.delete(schema.user).where(inArray(schema.user.id, users));
});

beforeEach(async () => {
  await db.delete(schema.checkIns).where(inArray(schema.checkIns.eventId, events));
});

const checkIn = (input: { userId: string; targetEventId?: string; now?: Date }) =>
  Ticket.checkIn({
    eventId,
    targetEventId: input.targetEventId,
    who: { userId: input.userId },
    actorId,
    now: input.now ?? now,
  });

describe('passEligibility', () => {
  test('issues a pass to someone holding a spot', async () => {
    await expect(Ticket.passEligibility(eventId, attendeeId)).resolves.toMatchObject({
      eventName: 'Ticket Hackathon',
      isParticipant: true,
    });
  });

  test.each([
    ['an invitation not yet accepted', () => [eventId, invitedId]],
    ['a sub-event', () => [lunchId, attendeeId]],
    ['check-in turned off', () => [disabledEventId, attendeeId]],
    ['a malformed event id', () => ['not-a-uuid', attendeeId]],
  ])('issues none for %s', async (_case, args) => {
    const [event, user] = args();
    await expect(Ticket.passEligibility(event, user)).resolves.toBeNull();
  });
});

describe('checkIn', () => {
  test('checks a spot holder in at the door', async () => {
    await expect(checkIn({ userId: attendeeId })).resolves.toMatchObject({
      success: true,
      data: { alreadyCheckedIn: false, name: 'Ticket Attendee', targetName: null },
    });
  });

  test('refuses someone without a held spot', async () => {
    await expect(checkIn({ userId: invitedId })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('not registered'),
    });
  });

  test('freezes once the event has ended', async () => {
    await expect(checkIn({ userId: attendeeId, now: at(25 * HOUR) })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('frozen'),
    });
  });

  test('sends someone to the door before a sub-event', async () => {
    await expect(checkIn({ userId: attendeeId, targetEventId: lunchId })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('at the door first'),
    });

    await checkIn({ userId: attendeeId });
    await expect(checkIn({ userId: attendeeId, targetEventId: lunchId })).resolves.toMatchObject({
      success: true,
      data: { targetName: 'Ticket Lunch' },
    });
  });

  test('closes a sub-event outside its slot to an actor without the override', async () => {
    await checkIn({ userId: attendeeId });
    await expect(checkIn({ userId: attendeeId, targetEventId: lunchId, now: at(2 * HOUR) })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("isn't running"),
    });
  });

  test('refuses a payload that is not a signed pass', async () => {
    await expect(Ticket.checkIn({ eventId, who: { payload: 'not-a-pass' }, actorId, now })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('not a valid'),
    });
  });

  test('refuses a target that is not one of its sub-events', async () => {
    await expect(checkIn({ userId: attendeeId, targetEventId: disabledEventId })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('does not belong'),
    });
  });
});

describe('undoCheckIn', () => {
  test('removes the check-in until the event ends, then stays frozen', async () => {
    await checkIn({ userId: attendeeId });

    await expect(
      Ticket.undoCheckIn({ eventId, userId: attendeeId, actorId, now: at(25 * HOUR) }),
    ).resolves.toMatchObject({ success: false, error: expect.stringContaining('frozen') });

    await expect(Ticket.undoCheckIn({ eventId, userId: attendeeId, actorId, now })).resolves.toMatchObject({
      success: true,
    });
    const rows = await db.select().from(schema.checkIns).where(eq(schema.checkIns.eventId, eventId));
    expect(rows).toHaveLength(0);
  });
});
