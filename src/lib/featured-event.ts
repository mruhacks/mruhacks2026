import { cacheTag, cacheLife } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import { events } from '@/db/schema';

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
    .select({ id: events.id })
    .from(events)
    .where(eq(events.isFeatured, true))
    .limit(1);

  if (featured) {
    return `/dashboard/events/${featured.id}`;
  }

  return DEFAULT_REGISTER_URL;
}
