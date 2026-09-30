import { cacheTag, cacheLife } from 'next/cache';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/utils/db';
import { eventArticles } from '@/db/schema';

/** One tag per event so an edit only busts that event's wiki, not every event's. */
export function eventWikiCacheTag(eventId: string): string {
  return `event-wiki:${eventId}`;
}


/**
 * Published articles for an event's public wiki index. Same output for
 * every reader without draft access, so it's cached rather than queried per
 * visit. Invalidated by updateTag(eventWikiCacheTag(eventId)) on article
 * create/update/delete/reorder.
 */
export async function getPublishedArticleList(eventId: string) {
  'use cache';
  cacheTag(eventWikiCacheTag(eventId));
  // updateTag() covers article create/update/delete, but 'minutes' (still
  // App Shell-prefetchable) is a cheap safety net against a missed path.
  cacheLife('minutes');

  return db
    .select({
      slug: eventArticles.slug,
      title: eventArticles.title,
      published: eventArticles.published,
      updatedAt: eventArticles.updatedAt,
    })
    .from(eventArticles)
    .where(
      and(
        eq(eventArticles.eventId, eventId),
        eq(eventArticles.published, true),
      ),
    )
    .orderBy(asc(eventArticles.sortOrder), asc(eventArticles.title));
}

/**
 * A single published article's content, or null if no published article has
 * that slug (either it doesn't exist or it's still a draft). Cached like
 * `getPublishedArticleList`.
 */
export async function getPublishedArticle(eventId: string, slug: string) {
  'use cache';
  cacheTag(eventWikiCacheTag(eventId));
  // updateTag() covers article create/update/delete, but 'minutes' (still
  // App Shell-prefetchable) is a cheap safety net against a missed path.
  cacheLife('minutes');

  const [article] = await db
    .select({
      title: eventArticles.title,
      bodyMarkdown: eventArticles.bodyMarkdown,
      published: eventArticles.published,
      updatedAt: eventArticles.updatedAt,
    })
    .from(eventArticles)
    .where(
      and(
        eq(eventArticles.eventId, eventId),
        eq(eventArticles.slug, slug),
        eq(eventArticles.published, true),
      ),
    )
    .limit(1);

  return article ?? null;
}

/**
 * Every article for an event, drafts included — the admin wiki list.
 *
 * Separate from `getPublishedArticleList` rather than a flag on it: they're
 * different cache entries for different audiences, and keying one function
 * on a boolean would let a published-only reader warm (or read) the entry
 * holding unpublished drafts. Callers must hold `article:read:all`; that
 * check lives at the call site because a `use cache` scope can't read the
 * session.
 */
export async function getAllArticlesForAdmin(eventId: string) {
  'use cache';
  cacheTag(eventWikiCacheTag(eventId));
  // updateTag() covers article create/update/delete, but 'minutes' (still
  // App Shell-prefetchable) is a cheap safety net against a missed path.
  cacheLife('minutes');

  return db
    .select({
      id: eventArticles.id,
      slug: eventArticles.slug,
      title: eventArticles.title,
      published: eventArticles.published,
      updatedAt: eventArticles.updatedAt,
    })
    .from(eventArticles)
    .where(eq(eventArticles.eventId, eventId))
    .orderBy(asc(eventArticles.sortOrder), asc(eventArticles.title));
}
