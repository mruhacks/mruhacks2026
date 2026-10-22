import { cacheLife, cacheTag } from 'next/cache';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { db } from '@/utils/db';
import { serializeInstant } from '@/lib/datetime';
import { EVENTS_CACHE_TAG } from '@/lib/events';
import { isScheduleVisible, listSubevents } from '@/lib/subevents';
import type { Feed, Settings } from './schedule';

/*
 * Every screen polls the feed every 15 seconds, so it's served from cache and
 * only reaches the database after a change. Each read below is tagged, and the
 * admin actions that change what it holds clear that tag; the one-day
 * `revalidate` is only a safety net for writes made outside the app (seed and
 * reset scripts).
 */

export const SETTINGS_CACHE_TAG = 'display-settings';

const DEFAULT_SETTINGS: Settings = { showClock: false, theme: 'light' };

export async function getDisplaySettings(): Promise<Settings> {
  'use cache';
  cacheTag(SETTINGS_CACHE_TAG);
  cacheLife('days');

  const [row] = await db
    .select({
      showClock: schema.displaySettings.showClock,
      theme: schema.displaySettings.theme,
    })
    .from(schema.displaySettings)
    .where(eq(schema.displaySettings.id, 1))
    .limit(1);
  return row ?? DEFAULT_SETTINGS;
}

/**
 * Everything a screen shows: the featured event's visible schedule and the
 * display settings, serialized for the wire. Tagged with `EVENTS_CACHE_TAG`
 * (also cleared by the admin event actions, same as `getAllEvents`) plus the
 * tags the nested `listSubevents`/`getDisplaySettings` reads carry; the
 * explicit `cacheLife` here overrides their shorter lifetimes.
 */
export async function loadDisplayFeed(): Promise<Feed> {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  cacheLife('days');

  const [[event], settings] = await Promise.all([
    db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.isFeatured, true)).limit(1),
    getDisplaySettings(),
  ]);
  const subevents = event ? await listSubevents(event.id) : [];

  return {
    schedule: subevents.filter(isScheduleVisible).map((entry) => ({
      id: entry.id,
      name: entry.name,
      location: entry.location,
      startsAt: serializeInstant(entry.startsAt!),
      endsAt: serializeInstant(entry.endsAt),
    })),
    settings,
  };
}
