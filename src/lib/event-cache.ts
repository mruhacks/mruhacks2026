import 'server-only';

import { eq } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';

import * as schema from '@/db/schema';
import { db } from '@/utils/db';
import { adminEventCacheTag, eventApplicationsCacheTag } from '@/lib/admin-event';
import { EVENTS_CACHE_TAG } from '@/lib/events';
import { eventWikiCacheTag } from '@/lib/event-wiki';
import { FEATURED_EVENT_CACHE_TAG } from '@/lib/featured-event';
import { PROJECT_SHOWCASE_CACHE_TAG } from '@/lib/project-showcase';
import { subeventsCacheTag } from '@/lib/subevents';

/**
 * The one place that knows which caches depend on an event. Actions say what
 * changed; this works out every cache tag and page to bust for it.
 *
 * - `participation`: an application, review, RSVP, withdrawal or team change
 * - `checkin`: a check-in recorded or undone, which only moves the dashboard's counts
 * - `projects`: a project submitted, edited, deactivated or placed
 * - `judging`: judging setup, judges and their votes
 * - `questions`: the application form
 * - `content`: the description or terms
 * - `wiki`: a wiki article
 * - `settings`: the event row itself (name, slug, dates, featured, …)
 * - `schedule`: a sub-event added to or removed from this event
 */
export type EventChange =
  | 'participation'
  | 'checkin'
  | 'projects'
  | 'judging'
  | 'questions'
  | 'content'
  | 'wiki'
  | 'settings'
  | 'schedule';

type EventCacheTargets = {
  tags: string[];
  /** `revalidatePath` arguments: a path, and `'layout'` to reach every page under it. */
  paths: [path: string, type?: 'layout'][];
};

/**
 * Pure mapping from a change to what it invalidates. `previousSlug` is the
 * slug an event had before a settings change renamed it, whose URLs may
 * still be cached.
 */
function eventCacheTargets(
  event: { id: string; slug: string | null; parentEventId: string | null },
  change: EventChange,
  { previousSlug }: { previousSlug?: string | null } = {},
): EventCacheTargets {
  const parentTags = event.parentEventId ? [subeventsCacheTag(event.parentEventId)] : [];
  const tags = {
    participation: [eventApplicationsCacheTag(event.id)],
    checkin: [eventApplicationsCacheTag(event.id)],
    projects: [eventApplicationsCacheTag(event.id), PROJECT_SHOWCASE_CACHE_TAG],
    judging: [],
    questions: [adminEventCacheTag(event.id)],
    content: [adminEventCacheTag(event.id), ...parentTags],
    wiki: [eventWikiCacheTag(event.id)],
    settings: [FEATURED_EVENT_CACHE_TAG, EVENTS_CACHE_TAG, adminEventCacheTag(event.id), ...parentTags],
    schedule: [
      subeventsCacheTag(event.id),
      EVENTS_CACHE_TAG,
      adminEventCacheTag(event.id),
      eventApplicationsCacheTag(event.id),
    ],
  }[change];

  // An event is reachable by uuid and by slug, and each is its own cached
  // URL; 'layout' reaches every page under it (wiki, project, judging, …).
  if (change === 'checkin') {
    // The desk polls for itself, so a scan only has to move the cached
    // counts; refreshing every page of the event on each one is wasted work.
    return { tags, paths: [] };
  }
  const segments = [...new Set([event.id, event.slug, previousSlug].filter((s): s is string => Boolean(s)))];
  const paths: EventCacheTargets['paths'] = segments.flatMap((segment) => [
    [`/dashboard/events/${segment}`, 'layout'],
    [`/dashboard/admin/events/${segment}`, 'layout'],
  ]);
  if (change === 'participation') {
    // Your own registrations show on the dashboard home and events list, and
    // onboarding's featured-event step shows whether you've applied.
    paths.push(['/dashboard'], ['/dashboard/events'], ['/welcome', 'layout']);
  }

  return { tags, paths };
}

/**
 * Busts every cache that shows `change` for this event.
 *
 * Callers run this after their write has committed, so it never throws: a
 * failed slug lookup must not turn a saved write into a reported failure (or
 * skip the audit log after it). Without the lookup it still busts the tags
 * and the uuid URLs, missing only the slug URLs and the parent's schedule.
 */
export async function invalidateEvent(
  eventId: string,
  change: EventChange,
  options: { previousSlug?: string | null } = {},
): Promise<void> {
  const row = change === 'checkin' ? undefined : await lookupEvent(eventId);
  const targets = eventCacheTargets(
    { id: eventId, slug: row?.slug ?? null, parentEventId: row?.parentEventId ?? null },
    change,
    options,
  );
  for (const tag of targets.tags) updateTag(tag);
  for (const [path, type] of targets.paths) revalidatePath(path, type);
}

async function lookupEvent(eventId: string) {
  try {
    const [row] = await db
      .select({ slug: schema.events.slug, parentEventId: schema.events.parentEventId })
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .limit(1);
    return row;
  } catch (error) {
    console.error('[event-cache] Event lookup failed; invalidating by uuid only:', error);
    return undefined;
  }
}
