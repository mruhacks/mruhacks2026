import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { hasPermission } from '@/lib/rbac/authorization';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { eventArticles, events } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Props = {
  params: Promise<{ eventId: string; slug: string }>;
};

export default async function EventWikiArticlePage({ params }: Props) {
  const { eventId, slug } = await params;
  const user = await getUser();
  if (!user) redirect('/signin');

  const [event] = await db
    .select({ id: events.id, name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) notFound();

  const [article] = await db
    .select({
      title: eventArticles.title,
      bodyMarkdown: eventArticles.bodyMarkdown,
      published: eventArticles.published,
      updatedAt: eventArticles.updatedAt,
    })
    .from(eventArticles)
    .where(
      and(eq(eventArticles.eventId, eventId), eq(eventArticles.slug, slug)),
    )
    .limit(1);

  // A draft is a 404 to everyone but the organizers who may read drafts —
  // "not found" rather than "forbidden", so an unpublished slug doesn't
  // confirm that an article by that name exists.
  if (!article) notFound();
  if (
    !article.published &&
    !(await hasPermission(user.id, 'article:read:all'))
  ) {
    notFound();
  }

  return (
    <article className='max-w-2xl space-y-6'>
      <BreadcrumbSegment id={eventId} label={event.name} />
      <div>
        <Button
          asChild
          variant='ghost'
          size='sm'
          className='text-muted-foreground mb-2 -ml-2'
        >
          <Link href={`/dashboard/events/${eventId}/wiki`}>
            <ArrowLeft className='mr-1.5 size-4' />
            Event wiki
          </Link>
        </Button>
        <div className='flex flex-wrap items-center gap-2'>
          <h1 className='text-3xl font-semibold'>{article.title}</h1>
          {!article.published && <Badge variant='outline'>Draft</Badge>}
        </div>
        <p className='text-muted-foreground mt-2 text-sm'>
          Updated{' '}
          {new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(
            article.updatedAt,
          )}
        </p>
      </div>

      {article.bodyMarkdown.trim() ? (
        <MarkdownContent markdown={article.bodyMarkdown} />
      ) : (
        <p className='text-muted-foreground text-sm'>
          This article has no content yet.
        </p>
      )}
    </article>
  );
}
