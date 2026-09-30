import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { resolveEventId } from '@/lib/events';
import { eventPath } from '@/lib/event-slug';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { events, eventTerms } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { LocalDateTime } from '@/components/local-date-time';

type Props = {
  params: Promise<{ eventId: string }>;
};

/**
 * Event Terms, rendered like a wiki article (see `[slug]/page.tsx`) but
 * sourced from `events.termsId` / `eventTerms` rather than `eventArticles` —
 * this is the target of the pseudo "Event Terms" entry always appended last
 * to the wiki list, and of the "agreed to" link on the RSVP status card.
 */
export default async function EventTermsPage({ params }: Props) {
  // The segment may be the event's custom slug rather than its uuid.
  const { eventId: segment } = await params;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');

  const [row] = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      termsMarkdown: eventTerms.markdown,
      termsUpdatedAt: eventTerms.createdAt,
    })
    .from(events)
    .leftJoin(eventTerms, eq(events.termsId, eventTerms.id))
    .where(eq(events.id, eventId))
    .limit(1);

  if (!row || !row.termsMarkdown) notFound();

  return (
    <article className='max-w-2xl space-y-6'>
      <BreadcrumbSegment id={segment} label={row.name} />
      <div>
        <Button
          asChild
          variant='ghost'
          size='sm'
          className='text-muted-foreground mb-2 -ml-2'
        >
          <Link href={`${eventPath(row)}/wiki`}>
            <ArrowLeft className='mr-1.5 size-4' />
            Hackerpack
          </Link>
        </Button>
        <h1 className='text-3xl font-semibold'>Event Terms</h1>
        {row.termsUpdatedAt && (
          <p className='text-muted-foreground mt-2 text-sm'>
            Updated{' '}
            <LocalDateTime value={row.termsUpdatedAt} dateStyle='long' />
          </p>
        )}
      </div>

      <MarkdownContent markdown={row.termsMarkdown} />
    </article>
  );
}
