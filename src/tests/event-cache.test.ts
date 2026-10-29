/**
 * Tests for src/lib/event-cache.ts: which tags and pages each kind of event
 * change invalidates. Actions are tested on the change they report; this is
 * the one place the change → tags/paths mapping is pinned down.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { revalidatePath, updateTag } from 'next/cache';
import type { EventChange } from '@/lib/event-cache';

// The test setup swaps `invalidateEvent` for a spy; this file tests the real one.
const { invalidateEvent } = await vi.importActual<typeof import('@/lib/event-cache')>('@/lib/event-cache');

let plainId: string;
let sluggedId: string;
let subeventId: string;
const created: string[] = [];

beforeAll(async () => {
  const insert = async (values: typeof schema.events.$inferInsert) => {
    const [row] = await db.insert(schema.events).values(values).returning({ id: schema.events.id });
    created.push(row.id);
    return row.id;
  };
  plainId = await insert({ name: 'Cache Plain Event' });
  sluggedId = await insert({ name: 'Cache Slugged Event', slug: 'cache-test-2026' });
  subeventId = await insert({ name: 'Cache Sub-event', parentEventId: plainId });
});

afterAll(async () => {
  await db.delete(schema.events).where(inArray(schema.events.id, created.reverse()));
});

beforeEach(() => {
  vi.mocked(updateTag).mockClear();
  vi.mocked(revalidatePath).mockClear();
});

const tags = () => vi.mocked(updateTag).mock.calls.map(([tag]) => tag);
const paths = () => vi.mocked(revalidatePath).mock.calls;

describe('invalidateEvent', () => {
  test('refreshes every page of the event, participant and admin, under every URL it has', async () => {
    await invalidateEvent(sluggedId, 'wiki');
    expect(paths()).toEqual([
      [`/dashboard/events/${sluggedId}`, 'layout'],
      [`/dashboard/admin/events/${sluggedId}`, 'layout'],
      ['/dashboard/events/cache-test-2026', 'layout'],
      ['/dashboard/admin/events/cache-test-2026', 'layout'],
    ]);
  });

  test('a renamed event also drops the URLs of its previous slug', async () => {
    await invalidateEvent(sluggedId, 'settings', { previousSlug: 'old-slug' });
    expect(paths()).toContainEqual(['/dashboard/events/old-slug', 'layout']);
    expect(paths()).toContainEqual(['/dashboard/events/cache-test-2026', 'layout']);
  });

  test('participation also refreshes the dashboard and onboarding', async () => {
    await invalidateEvent(plainId, 'participation');
    expect(paths()).toEqual(
      expect.arrayContaining([
        ['/dashboard', undefined],
        ['/dashboard/events', undefined],
        ['/welcome', 'layout'],
      ]),
    );
  });

  test('a check-in only moves the counts, refreshing no pages', async () => {
    await invalidateEvent(sluggedId, 'checkin');
    expect(tags()).toEqual([`event-applications:${sluggedId}`]);
    expect(paths()).toEqual([]);
  });

  test('other changes leave the dashboard alone', async () => {
    await invalidateEvent(plainId, 'wiki');
    expect(paths().map(([path]) => path)).not.toContain('/dashboard');
  });

  test.each<[EventChange, (id: string) => string[]]>([
    ['participation', (id) => [`event-applications:${id}`]],
    ['projects', (id) => [`event-applications:${id}`, 'project-showcase']],
    ['judging', () => []],
    ['questions', (id) => [`admin-event:${id}`]],
    ['content', (id) => [`admin-event:${id}`]],
    ['wiki', (id) => [`event-wiki:${id}`]],
    ['settings', (id) => ['featured-event', 'events', `admin-event:${id}`]],
    ['schedule', (id) => [`subevents:${id}`, 'events', `admin-event:${id}`, `event-applications:${id}`]],
  ])('%s busts its tags', async (change, expected) => {
    await invalidateEvent(plainId, change);
    expect(tags()).toEqual(expected(plainId));
  });

  test.each<EventChange>(['content', 'settings'])(
    "a sub-event's %s also refreshes its parent's schedule",
    async (change) => {
      await invalidateEvent(subeventId, change);
      expect(tags()).toContain(`subevents:${plainId}`);
    },
  );

  test("a sub-event's participation leaves its parent's schedule alone", async () => {
    await invalidateEvent(subeventId, 'participation');
    expect(tags()).not.toContain(`subevents:${plainId}`);
  });
});
