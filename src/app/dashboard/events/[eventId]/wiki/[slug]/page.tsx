import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { hasPermission } from '@/lib/rbac/authorization';
import { getPublishedArticle } from '@/lib/event-wiki';
import { resolveEventId } from '@/lib/events';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { eventArticles, events, eventTerms } from '@/db/schema';
import { LocalDateTime } from '@/components/local-date-time';
import { Card } from '@/components/ui/card';

type Props = {
  params: Promise<{ eventId: string; slug: string }>;
};

type Article = { bodyMarkdown: string; updatedAt: Date };

/**
 * `terms` is a reserved article slug (`RESERVED_ARTICLE_SLUGS` in
 * `@/lib/slug`) rather than a real `eventArticles` row — Event Terms is
 * sourced from `events.termsId` / `eventTerms` so it stays editable through
 * the dedicated terms settings form instead of the article editor. It's
 * synthesized onto the end of the wiki sidebar (see `../layout.tsx`) and
 * rendered through this same article path rather than a page of its own.
 */
async function getTermsArticle(eventId: string): Promise<Article | null> {
  const [row] = await db
    .select({
      bodyMarkdown: eventTerms.markdown,
      updatedAt: eventTerms.createdAt,
    })
    .from(events)
    .innerJoin(eventTerms, eq(events.termsId, eventTerms.id))
    .where(eq(events.id, eventId))
    .limit(1);
  return row ?? null;
}

export default async function EventWikiArticlePage({ params }: Props) {
  // The event segment may be the event's custom slug rather than its uuid;
  // `slug` here is the article's, which is only ever unique within the event.
  const { eventId: segment, slug } = await params;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');

  let article: Article | null;

  if (slug === 'terms') {
    article = await getTermsArticle(eventId);
  } else {
    // The common case reads the cached, published-only lookup. A miss there
    // means either the slug doesn't exist or it's a draft — fall back to a
    // live query only for organizers who may read drafts.
    article = await getPublishedArticle(eventId, slug);
    if (!article) {
      // A draft is a 404 to everyone but the organizers who may read
      // drafts — "not found" rather than "forbidden", so an unpublished
      // slug doesn't confirm that an article by that name exists.
      if (!(await hasPermission(user.id, 'article:read:all'))) notFound();

      const [row] = await db
        .select({
          bodyMarkdown: eventArticles.bodyMarkdown,
          updatedAt: eventArticles.updatedAt,
        })
        .from(eventArticles)
        .where(
          and(
            eq(eventArticles.eventId, eventId),
            eq(eventArticles.slug, slug),
          ),
        )
        .limit(1);
      article = row ?? null;
    }
  }
  if (!article) notFound();

  return (
    <Card className='p-6'>
      <article className='max-w-3xl space-y-6'>
        {article.bodyMarkdown.trim() ? (
          <MarkdownContent markdown={article.bodyMarkdown} />
        ) : (
          <p className='text-muted-foreground text-sm'>
            This article has no content yet.
          </p>
        )}
      </article>

      <p className='text-muted-foreground mt-2 text-xs'>
        Updated <LocalDateTime value={article.updatedAt} dateStyle='long' />
      </p>
    </Card>
  );
}
