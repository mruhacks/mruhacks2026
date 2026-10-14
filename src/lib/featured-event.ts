import { cacheTag, cacheLife } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import { events } from '@/db/schema';
import { eventPath } from '@/lib/event-slug';
import { EVENTS_CACHE_TAG } from '@/lib/events';

export const FEATURED_EVENT_CACHE_TAG = 'featured-event';
const DEFAULT_REGISTER_URL = '/signup';

/**
 * URL the public "Register Now" buttons should link to.
 * Backed by the single event with isFeatured = true; falls back to /signup
 * if no event is currently featured. Cached until an admin edit calls
 * updateTag(FEATURED_EVENT_CACHE_TAG).
 */
export async function getFeaturedEventRegisterUrl(): Promise<string> {
  'use cache';
  cacheTag(FEATURED_EVENT_CACHE_TAG);
  cacheLife('hours');

  const [featured] = await db
    .select({ id: events.id, slug: events.slug })
    .from(events)
    .where(eq(events.isFeatured, true))
    .limit(1);

  if (featured) {
    return eventPath(featured);
  }

  return DEFAULT_REGISTER_URL;
}

export type FeaturedEventSchedule = {
  name: string;
  /** ISO instants (strings so they survive the cache boundary). */
  startsAt: string | null;
  endsAt: string | null;
};

/**
 * Name and schedule of the featured event, for the homepage's structured
 * data. Null if no event is featured.
 */
export async function getFeaturedEventSchedule(): Promise<FeaturedEventSchedule | null> {
  'use cache';
  cacheTag(FEATURED_EVENT_CACHE_TAG);
  cacheLife('hours');

  const [featured] = await db
    .select({
      name: events.name,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
    })
    .from(events)
    .where(eq(events.isFeatured, true))
    .limit(1);

  if (!featured) return null;

  return {
    name: featured.name,
    startsAt: featured.startsAt?.toISOString() ?? null,
    endsAt: featured.endsAt?.toISOString() ?? null,
  };
}

export type FeaturedEvent = {
  id: string;
  name: string;
  startsAt: Date | null;
  endsAt: Date | null;
};

/**
 * The featured event itself, or null when none is featured. Also tagged with
 * `EVENTS_CACHE_TAG` so an edit to its name or dates (which doesn't touch the
 * featured flag) still reaches the lobby displays.
 */
export async function getFeaturedEvent(): Promise<FeaturedEvent | null> {
  'use cache';
  cacheTag(FEATURED_EVENT_CACHE_TAG, EVENTS_CACHE_TAG);
  cacheLife('minutes');

  const [featured] = await db
    .select({
      id: events.id,
      name: events.name,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
    })
    .from(events)
    .where(eq(events.isFeatured, true))
    .limit(1);

  return featured ?? null;
}
