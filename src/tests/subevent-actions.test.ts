/**
 * Tests for src/app/dashboard/admin/events/subevent-actions.ts
 *
 * The invariants that matter here are structural rather than cosmetic: a
 * sub-event is exactly one level deep, and `deleteSubevent` is the only path in
 * the codebase that removes an `events` row — so the thing worth pinning is
 * that it cannot be aimed at a main event.
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';

import {
  checkIns,
  events,
  permission,
  user,
  userPermission,
} from '@/db/schema';
import { db } from '@/utils/db';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock('next/cache', () => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  // listSubevents is a `'use cache'` function; these are what that needs.
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import {
  createSubevent,
  deleteSubevent,
} from '@/app/dashboard/admin/events/subevent-actions';
import { updateEventSettings } from '@/app/dashboard/admin/events/actions';

const START = '2026-09-19T18:00:00.000Z';
const END = '2026-09-19T19:00:00.000Z';

let adminUserId: string;
let permissionId: number;
let eventId: string;
let otherEventId: string;
let attendeeId: string;

/** Creates a sub-event and returns its id. Teardown removes every child of the
 *  two parents, so individual ids don't need tracking. */
async function newSubevent(name: string, parentId = eventId) {
  const result = await createSubevent(parentId, {
    name,
    startsAt: START,
    endsAt: END,
    location: null,
  });
  expect(result.success).toBe(true);
  return result.success ? result.data!.id : '';
}

beforeAll(async () => {
  const [u] = await db
    .insert(user)
    .values({
      name: 'Subevent Admin',
      email: 'subevent-admin@test.dev',
      emailVerified: true,
    })
    .returning({ id: user.id });
  adminUserId = u.id;

  const [a] = await db
    .insert(user)
    .values({
      name: 'Subevent Attendee',
      email: 'subevent-attendee@test.dev',
      emailVerified: true,
    })
    .returning({ id: user.id });
  attendeeId = a.id;

  const [p] = await db
    .insert(permission)
    .values({ slug: 'event:manage:all' })
    .onConflictDoNothing()
    .returning({ id: permission.id });
  if (p) {
    permissionId = p.id;
  } else {
    const [existing] = await db
      .select({ id: permission.id })
      .from(permission)
      .where(eq(permission.slug, 'event:manage:all'))
      .limit(1);
    permissionId = existing!.id;
  }
  await db
    .insert(userPermission)
    .values({ userId: adminUserId, permissionId })
    .onConflictDoNothing();

  const rows = await db
    .insert(events)
    .values([
      {
        name: 'Subevent Parent',
        hasApplication: false,
        applicationQuestions: [],
      },
      {
        name: 'Subevent Other Parent',
        hasApplication: false,
        applicationQuestions: [],
      },
    ])
    .returning({ id: events.id });
  eventId = rows[0].id;
  otherEventId = rows[1].id;

  vi.mocked(getUser).mockResolvedValue({
    id: adminUserId,
    email: 'subevent-admin@test.dev',
    name: 'Subevent Admin',
    emailVerified: true,
  } as never);
});

afterAll(async () => {
  // Children first: the parent delete would otherwise orphan them, since
  // parent_event_id is ON DELETE SET NULL.
  await db.delete(events).where(eq(events.parentEventId, eventId));
  await db.delete(events).where(eq(events.parentEventId, otherEventId));
  await db.delete(events).where(eq(events.id, eventId));
  await db.delete(events).where(eq(events.id, otherEventId));
  await db.delete(userPermission).where(eq(userPermission.userId, adminUserId));
  await db.delete(permission).where(eq(permission.id, permissionId));
  await db.delete(user).where(eq(user.id, adminUserId));
  await db.delete(user).where(eq(user.id, attendeeId));
});

describe('createSubevent', () => {
  test('returns an error when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(
      createSubevent(eventId, {
        name: 'Lunch',
        startsAt: START,
        endsAt: END,
        location: null,
      }),
    ).resolves.toMatchObject({ success: false });
  });

  test('requires a name', async () => {
    await expect(
      createSubevent(eventId, {
        name: '   ',
        startsAt: START,
        endsAt: END,
        location: null,
      }),
    ).resolves.toMatchObject({ success: false });
  });

  test('rejects an end that is not after the start', async () => {
    await expect(
      createSubevent(eventId, {
        name: 'Backwards',
        startsAt: END,
        endsAt: START,
        location: null,
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('before end time'),
    });
  });

  test('rejects a bare wall-clock string, not just a bad range', async () => {
    await expect(
      createSubevent(eventId, {
        // No zone: the instant this means depends on whose clock reads it,
        // which is exactly what the backend must never accept (AGENTS.md).
        name: 'Zoneless',
        startsAt: '2026-09-19T18:00',
        endsAt: END,
        location: null,
      }),
    ).resolves.toMatchObject({ success: false });
  });

  test('creates a child with participation flags pinned off', async () => {
    const id = await newSubevent('Saturday Lunch');

    const [row] = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    expect(row).toMatchObject({
      parentEventId: eventId,
      name: 'Saturday Lunch',
      slug: null,
      hasApplication: false,
      teamsEnabled: false,
      isFeatured: false,
    });
    expect(row.startsAt?.toISOString()).toBe(START);
    expect(row.endsAt?.toISOString()).toBe(END);
  });

  test('stores a trimmed location, or null for an empty one', async () => {
    const withLocation = await createSubevent(eventId, {
      name: 'Workshop',
      startsAt: START,
      endsAt: END,
      location: '  EA 1042  ',
    });
    expect(withLocation.success).toBe(true);

    const [row] = await db
      .select({ location: events.location })
      .from(events)
      .where(eq(events.id, withLocation.success ? withLocation.data!.id : ''))
      .limit(1);
    expect(row.location).toBe('EA 1042');
  });

  test('refuses to nest: a sub-event cannot be a parent', async () => {
    const child = await newSubevent('Depth Test');

    await expect(
      createSubevent(child, {
        name: 'Grandchild',
        startsAt: START,
        endsAt: END,
        location: null,
      }),
    ).resolves.toMatchObject({ success: false });
  });

  test('refuses an event id that does not exist', async () => {
    await expect(
      createSubevent('00000000-0000-0000-0000-000000000000', {
        name: 'Orphan',
        startsAt: START,
        endsAt: END,
        location: null,
      }),
    ).resolves.toMatchObject({ success: false });
  });
});

describe('deleteSubevent', () => {
  test('removes the sub-event and its check-ins', async () => {
    const id = await newSubevent('Doomed Lunch');
    await db.insert(checkIns).values({ eventId: id, userId: attendeeId });

    await expect(deleteSubevent(eventId, id)).resolves.toMatchObject({
      success: true,
    });

    const rows = await db.select().from(events).where(eq(events.id, id));
    expect(rows).toHaveLength(0);
    // check_ins.event_id cascades, so the attendance goes with it.
    const checkInRows = await db
      .select()
      .from(checkIns)
      .where(eq(checkIns.eventId, id));
    expect(checkInRows).toHaveLength(0);
  });

  // The whole reason this isn't a general `deleteEvent`.
  test('cannot delete a main event', async () => {
    await expect(deleteSubevent(eventId, eventId)).resolves.toMatchObject({
      success: false,
    });
    await expect(deleteSubevent(eventId, otherEventId)).resolves.toMatchObject({
      success: false,
    });

    const survivors = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.parentEventId)));
    expect(survivors).toHaveLength(1);
  });

  test("cannot delete another event's sub-event", async () => {
    const foreign = await newSubevent('Other Lunch', otherEventId);

    await expect(deleteSubevent(eventId, foreign)).resolves.toMatchObject({
      success: false,
    });

    const rows = await db.select().from(events).where(eq(events.id, foreign));
    expect(rows).toHaveLength(1);
  });

  test('returns an error when unauthenticated', async () => {
    const id = await newSubevent('Survives');
    vi.mocked(getUser).mockResolvedValueOnce(null as never);

    await expect(deleteSubevent(eventId, id)).resolves.toMatchObject({
      success: false,
    });
    const rows = await db.select().from(events).where(eq(events.id, id));
    expect(rows).toHaveLength(1);
  });
});

describe('featured-event guard', () => {
  /**
   * `idx_events_featured_unique` is sitewide, so a featured sub-event would take
   * over the public site's register link and the /welcome onboarding event from
   * the real event it belongs to. Every other nonsensical setting on a
   * sub-event is inert; this one isn't.
   */
  test('updateEventSettings refuses to feature a sub-event', async () => {
    const id = await newSubevent('Not Featured');

    await expect(
      updateEventSettings(id, { isFeatured: true }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('cannot be the featured event'),
    });

    const [row] = await db
      .select({ isFeatured: events.isFeatured })
      .from(events)
      .where(eq(events.id, id))
      .limit(1);
    expect(row.isFeatured).toBe(false);
  });

  test('a main event can still be featured', async () => {
    await expect(
      updateEventSettings(otherEventId, { isFeatured: true }),
    ).resolves.toMatchObject({ success: true });

    // Put it back, so this doesn't leak into another suite's expectations.
    await db
      .update(events)
      .set({ isFeatured: false })
      .where(eq(events.id, otherEventId));
  });
});
