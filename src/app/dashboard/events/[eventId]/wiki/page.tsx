import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { hasPermission } from '@/lib/rbac/authorization';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { eventArticles, events } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function EventWikiIndexPage({ params }: Props) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) redirect('/signin');

  const [event] = await db
    .select({ id: events.id, name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) notFound();

  // Organizers who can read drafts see them here too, badged — it saves them
  // a round trip through the admin UI to preview what they are writing.
  const canSeeDrafts = await hasPermission(user.id, 'article:read:all');

  const articles = await db
    .select({
      slug: eventArticles.slug,
      title: eventArticles.title,
      published: eventArticles.published,
      updatedAt: eventArticles.updatedAt,
    })
    .from(eventArticles)
    .where(
      canSeeDrafts
        ? eq(eventArticles.eventId, eventId)
        : and(
            eq(eventArticles.eventId, eventId),
            eq(eventArticles.published, true),
          ),
    )
    .orderBy(asc(eventArticles.sortOrder), asc(eventArticles.title));

  return (
    <div className='max-w-2xl space-y-6'>
      <BreadcrumbSegment id={eventId} label={event.name} />
      <div>
        <Button
          asChild
          variant='ghost'
          size='sm'
          className='text-muted-foreground mb-2 -ml-2'
        >
          <Link href={`/dashboard/events/${eventId}`}>
            <ArrowLeft className='mr-1.5 size-4' />
            {event.name}
          </Link>
        </Button>
        <h1 className='text-3xl font-semibold'>Event wiki</h1>
      </div>

      {articles.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          Nothing has been published yet. Check back closer to the event.
        </p>
      ) : (
        <ul className='divide-y rounded-md border'>
          {articles.map((article) => (
            <li key={article.slug}>
              <Link
                href={`/dashboard/events/${eventId}/wiki/${article.slug}`}
                className='hover:bg-muted/50 flex items-center justify-between gap-3 p-4'
              >
                <span className='font-medium'>{article.title}</span>
                {!article.published && <Badge variant='outline'>Draft</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
