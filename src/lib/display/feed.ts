import { cacheLife, cacheTag } from 'next/cache';
import { eq } from 'drizzle-orm';

import { displaySettings, events } from '@/db/schema';
import type { DisplayTheme } from '@/db/display';
import { db } from '@/utils/db';
import { serializeInstant } from '@/lib/datetime';
import { EVENTS_CACHE_TAG } from '@/lib/events';
import { isScheduleVisible, listSubevents } from '@/lib/subevents';
import type { DisplayFeed } from '@/lib/display/schedule';

/*
 * Every screen polls the feed every 15 seconds, so it's served from cache and
 * only reaches the database after a change. Each read below is tagged, and the
 * admin actions that change what it holds clear that tag; the one-day
 * `revalidate` is only a safety net for writes made outside the app (seed and
 * reset scripts).
 */

export const DISPLAY_SETTINGS_CACHE_TAG = 'display-settings';

export type DisplaySettings = { showClock: boolean; theme: DisplayTheme };

const DEFAULT_SETTINGS: DisplaySettings = { showClock: false, theme: 'light' };

export async function getDisplaySettings(): Promise<DisplaySettings> {
  'use cache';
  cacheTag(DISPLAY_SETTINGS_CACHE_TAG);
  cacheLife('days');

  const [row] = await db
    .select({
      showClock: displaySettings.showClock,
      theme: displaySettings.theme,
    })
    .from(displaySettings)
    .where(eq(displaySettings.id, 1))
    .limit(1);
  return row ?? DEFAULT_SETTINGS;
}

/**
 * Everything a screen shows: the featured event, its visible schedule and the
 * display settings, serialized for the wire. Tagged with `EVENTS_CACHE_TAG`
 * (also cleared by the admin event actions, same as `getAllEvents`) plus the
 * tags the nested `listSubevents`/`getDisplaySettings` reads carry; the
 * explicit `cacheLife` here overrides their shorter lifetimes.
 */
export async function loadDisplayFeed(): Promise<DisplayFeed> {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  cacheLife('days');

  const [[event], settings] = await Promise.all([
    db
      .select({
        id: events.id,
        name: events.name,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
      })
      .from(events)
      .where(eq(events.isFeatured, true))
      .limit(1),
    getDisplaySettings(),
  ]);
  const subevents = event ? await listSubevents(event.id) : [];

  return {
    event: event
      ? {
          name: event.name,
          startsAt: serializeInstant(event.startsAt),
          endsAt: serializeInstant(event.endsAt),
        }
      : null,
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
