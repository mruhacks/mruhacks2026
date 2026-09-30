import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { ArrowLeft, BookOpen } from 'lucide-react';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { hasPermission } from '@/lib/rbac/authorization';
import { getPublishedArticleList } from '@/lib/event-wiki';
import { resolveEventId } from '@/lib/events';
import { eventPath } from '@/lib/event-slug';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { eventArticles, events } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { WikiSidebar, type WikiSidebarArticle } from './wiki-sidebar';

type Props = {
  params: Promise<{ eventId: string }>;
  children: ReactNode;
};

/**
 * Notion-style shell for the whole `/wiki` section: a sidebar listing every
 * article (shared by the index, an article page, and the terms page) next to
 * a center panel that `children` fills in. Lives in the layout rather than
 * each page so the sidebar doesn't remount — and lose scroll position — when
 * navigating between articles.
 */
export default async function EventWikiLayout({ params, children }: Props) {
  // The segment may be the event's custom slug rather than its uuid.
  const { eventId: segment } = await params;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');

  const [event] = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      termsId: events.termsId,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) notFound();

  // Organizers who can read drafts see them here too, badged — it saves them
  // a round trip through the admin UI to preview what they are writing.
  const canSeeDrafts = await hasPermission(user.id, 'article:read:all');

  const articles = canSeeDrafts
    ? await db
        .select({
          slug: eventArticles.slug,
          title: eventArticles.title,
          published: eventArticles.published,
        })
        .from(eventArticles)
        .where(eq(eventArticles.eventId, eventId))
        .orderBy(asc(eventArticles.sortOrder), asc(eventArticles.title))
    : await getPublishedArticleList(eventId);

  // Event Terms isn't a real article — it's synthesized onto the end of the
  // list so it's always reachable from the wiki without living in
  // `eventArticles` (whose slugs are freely editable by organizers).
  const articlesWithTerms: WikiSidebarArticle[] = event.termsId
    ? [
        ...articles.map((a) => ({
          slug: a.slug,
          title: a.title,
          published: a.published,
        })),
        { slug: 'terms', title: 'Event Terms', published: true },
      ]
    : articles.map((a) => ({
        slug: a.slug,
        title: a.title,
        published: a.published,
      }));

  const eventHref = eventPath(event);

  return (
    <div className='grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start'>
      <BreadcrumbSegment id={segment} label={event.name} />

      <div className='flex flex-col gap-6 lg:sticky lg:top-24'>
        <div>
          <Button
            asChild
            variant='ghost'
            size='sm'
            className='text-muted-foreground mb-2 -ml-2'
          >
            <Link href={eventHref}>
              <ArrowLeft className='mr-1.5 size-4' />
              {event.name}
            </Link>
          </Button>
          <h1 className='flex items-center gap-2 text-3xl font-semibold'>
            <BookOpen className='size-6 shrink-0' aria-hidden />
            Hackerpack
          </h1>
        </div>
        <WikiSidebar eventHref={eventHref} articles={articlesWithTerms} />
      </div>

      <div className='min-w-0'>{children}</div>
    </div>
  );
}
