import { describe, test, expect, afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
// `connection()` needs a request scope; the handler is called directly here.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
  connection: vi.fn(),
}));
vi.mock('@/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/auth')>()),
  getUser: vi.fn(),
}));

import { updateTag } from 'next/cache';
import { getUser } from '@/utils/auth';
import * as Display from '@/lib/display/server';
import { GET as getFeed } from '@/app/api/display/feed/route';
import { updateDisplaySettings } from '@/app/dashboard/admin/displays/actions';

async function makeUser(label: string): Promise<string> {
  const [u] = await db
    .insert(schema.user)
    .values({
      name: `Display Test ${label}`,
      email: `display-test-${label}-${Date.now()}@example.com`,
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  return u.id;
}

beforeEach(async () => {
  await db
    .insert(schema.displaySettings)
    .values({ id: 1 })
    .onConflictDoUpdate({
      target: schema.displaySettings.id,
      set: { showClock: false, theme: 'light' },
    });
});

describe('feed', () => {
  // These tests need control of which event is featured; put the seeded one
  // back afterwards so later test files (and the dev app) still find it.
  let featuredIds: string[] = [];
  beforeAll(async () => {
    featuredIds = (
      await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.isFeatured, true))
    ).map((row) => row.id);
  });
  afterAll(async () => {
    await db.update(schema.events).set({ isFeatured: false }).where(eq(schema.events.isFeatured, true));
    if (featuredIds.length > 0) {
      await db.update(schema.events).set({ isFeatured: true }).where(inArray(schema.events.id, featuredIds));
    }
  });

  test('serves the featured event schedule and settings, unauthenticated', async () => {
    await db.update(schema.events).set({ isFeatured: false }).where(eq(schema.events.isFeatured, true));
    const [parent] = await db
      .insert(schema.events)
      .values({
        name: 'Display Test Hackathon',
        slug: `display-test-${Date.now()}`,
        isFeatured: true,
      })
      .returning({ id: schema.events.id });
    await db.insert(schema.events).values([
      {
        name: 'Opening Ceremony',
        slug: `display-test-opening-${Date.now()}`,
        parentEventId: parent.id,
        location: 'Ross Glenn Hall',
        startsAt: new Date('2026-10-24T02:30:00Z'),
        endsAt: new Date('2026-10-24T03:00:00Z'),
      },
      {
        // No start time: not on the schedule.
        name: 'Unscheduled',
        slug: `display-test-unscheduled-${Date.now()}`,
        parentEventId: parent.id,
      },
    ]);

    const res = await getFeed();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      schedule: [
        {
          id: expect.any(String),
          name: 'Opening Ceremony',
          location: 'Ross Glenn Hall',
          startsAt: '2026-10-24T02:30:00.000Z',
          endsAt: '2026-10-24T03:00:00.000Z',
        },
      ],
      settings: { showClock: false, theme: 'light' },
    });

    await db.delete(schema.events).where(eq(schema.events.parentEventId, parent.id));
    await db.delete(schema.events).where(eq(schema.events.id, parent.id));
  });

  test('with no featured event: an empty schedule', async () => {
    await db.update(schema.events).set({ isFeatured: false }).where(eq(schema.events.isFeatured, true));
    const body = await (await getFeed()).json();
    expect(body.schedule).toEqual([]);
  });
});

describe('updateDisplaySettings', () => {
  let organizerId: string;

  beforeAll(async () => {
    organizerId = await makeUser('organizer');
    const [perm] = await db
      .insert(schema.permission)
      .values({ slug: 'display:manage:all' })
      .onConflictDoUpdate({
        target: schema.permission.slug,
        set: { slug: 'display:manage:all' },
      })
      .returning({ id: schema.permission.id });
    await db.insert(schema.userPermission).values({ userId: organizerId, permissionId: perm.id }).onConflictDoNothing();
  });

  test('requires display:manage:all', async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: await makeUser('outsider'),
    } as never);
    await expect(updateDisplaySettings({ showClock: true, theme: 'dark' })).rejects.toThrow(/REDIRECT:\/forbidden/);
  });

  test('saves, clears the cached feed and audits', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: organizerId } as never);
    vi.mocked(updateTag).mockClear();

    const result = await updateDisplaySettings({
      showClock: true,
      theme: 'dark',
    });
    expect(result.success).toBe(true);
    expect(updateTag).toHaveBeenCalledWith(Display.SETTINGS_CACHE_TAG);
    expect((await (await getFeed()).json()).settings).toEqual({
      showClock: true,
      theme: 'dark',
    });

    const [entry] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, 'display.settings_updated'), eq(schema.auditLog.actorId, organizerId)));
    expect(entry).toBeDefined();
  });
});
