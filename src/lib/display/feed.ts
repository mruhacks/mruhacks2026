import { cacheLife, cacheTag } from 'next/cache';
import { eq } from 'drizzle-orm';

import { displaySettings } from '@/db/schema';
import type { DisplayTheme } from '@/db/display';
import { db } from '@/utils/db';
import { serializeInstant } from '@/lib/datetime';
import { getFeaturedEvent } from '@/lib/featured-event';
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
 * display settings, serialized for the wire. Its tags come from the cached
 * reads inside it (`FEATURED_EVENT_CACHE_TAG`, `EVENTS_CACHE_TAG`, the
 * parent's sub-events tag and `DISPLAY_SETTINGS_CACHE_TAG`), which the admin
 * event, sub-event and display-settings actions already clear; the explicit
 * `cacheLife` here overrides their shorter lifetimes.
 */
export async function loadDisplayFeed(): Promise<DisplayFeed> {
  'use cache';
  cacheLife('days');

  const [event, settings] = await Promise.all([
    getFeaturedEvent(),
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
