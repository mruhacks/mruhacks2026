import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { BookOpen } from 'lucide-react';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { hasPermission } from '@/lib/rbac/authorization';
import { getWikiSidebarArticles } from '@/lib/event-wiki';
import { resolveEventId } from '@/lib/events';
import { eventPath } from '@/lib/event-slug';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { events } from '@/db/schema';
import { WikiSidebar } from './wiki-sidebar';

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

  const articlesWithTerms = await getWikiSidebarArticles(eventId, {
    canSeeDrafts,
    hasTerms: event.termsId !== null,
  });

  const eventHref = eventPath(event);

  return (
    <div className='grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start'>
      <BreadcrumbSegment id={segment} label={event.name} />

      <div className='flex flex-col gap-6 lg:sticky lg:top-24'>
        <h1 className='flex items-center gap-2 text-3xl font-semibold'>
          <BookOpen className='size-6 shrink-0' aria-hidden />
          Hackerpack
        </h1>
        <WikiSidebar eventHref={eventHref} articles={articlesWithTerms} />
      </div>

      <div className='min-w-0'>{children}</div>
    </div>
  );
}
