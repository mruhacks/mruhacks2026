import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { FileText, Pencil } from 'lucide-react';

import { db } from '@/utils/db';
import { events, eventTerms } from '@/db/schema';
import { getAllArticlesForAdmin } from '@/lib/event-wiki';
import { resolveEventId } from '@/lib/events';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';
import { LocalDateTime } from '@/components/local-date-time';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { BentoCard, BentoCardSkeleton } from '../../_components/bento-card';
import { CreateArticleDialog } from './create-article-dialog';
import { WikiArticleList } from './wiki-article-list';

type Props = { params: Promise<{ eventId: string }> };

export default function WikiCell({ params }: Props) {
  return (
    <React.Suspense fallback={<BentoCardSkeleton rows={4} />}>
      <WikiSection paramsPromise={params} />
    </React.Suspense>
  );
}

/**
 * The whole wiki admin surface: listing, create, edit, publish and delete all
 * happen from this cell, which is why there is no longer a `/wiki` route
 * under the event. The sortable list receives fresh server data after mutations.
 */
async function WikiSection({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) return null;
  const user = await getUser();
  if (!user) redirect('/signin');

  const [canRead, canWrite, canManageEvent] = await Promise.all([
    hasPermission(user.id, 'article:read:all'),
    hasPermission(user.id, 'article:write:all'),
    // Event Terms is edited through the event settings surface, which is
    // gated on event:manage — a different permission than the wiki's own
    // article:write:all, so its edit link here is gated the same way rather
    // than piggybacking on `canWrite`.
    hasPermission(user.id, 'event:manage'),
  ]);
  if (!canRead) return null;

  // Only fetched once the viewer is known to be allowed to see drafts.
  const [articles, [eventRow]] = await Promise.all([
    getAllArticlesForAdmin(eventId),
    db
      .select({ termsId: events.termsId, termsUpdatedAt: eventTerms.createdAt })
      .from(events)
      .leftJoin(eventTerms, eq(events.termsId, eventTerms.id))
      .where(eq(events.id, eventId))
      .limit(1),
  ]);
  const hasTerms = Boolean(eventRow?.termsId);

  return (
    <BentoCard
      title='Wiki articles'
      contentClassName='p-0'
      action={canWrite ? <CreateArticleDialog eventId={eventId} /> : undefined}
    >
      {articles.length === 0 && !hasTerms ? (
        <p className='text-muted-foreground px-4 py-5 text-sm'>
          No articles yet.
          {canWrite ? ' Add one to start the wiki.' : ''}
        </p>
      ) : (
        <>
          {articles.length > 0 && (
            <WikiArticleList
              eventId={eventId}
              articles={articles}
              canWrite={canWrite}
            />
          )}
          {hasTerms && (
            <WikiTermsRow
              eventId={eventId}
              basePath={`/dashboard/admin/events/${segment}`}
              updatedAt={eventRow.termsUpdatedAt}
              canManageEvent={canManageEvent}
              bordered={articles.length > 0}
            />
          )}
        </>
      )}
    </BentoCard>
  );
}

/**
 * Event Terms isn't a real article (it lives on `events`/`eventTerms`, not
 * `eventArticles`), so it can't be dragged, published or deleted like the
 * rows above it — it's a fixed, always-last display-only entry, matching the
 * pseudo "Event Terms" wiki entry shown to participants.
 */
function WikiTermsRow({
  eventId,
  basePath,
  updatedAt,
  canManageEvent,
  bordered,
}: {
  eventId: string;
  basePath: string;
  updatedAt: Date | null;
  canManageEvent: boolean;
  bordered: boolean;
}) {
  return (
    <div
      className={cn(
        'hover:bg-accent/50 relative flex items-center gap-2 px-4 py-3',
        bordered && 'border-t',
      )}
    >
      {/* `after:inset-0` stretches the link over the whole row, which leaves
          room beside it for the edit button — positioned, so it stays
          clickable (same trick as `WikiArticleRow`). */}
      <Link
        href={`/dashboard/events/${eventId}/wiki/terms`}
        className='flex min-w-0 flex-1 items-center gap-3 after:absolute after:inset-0'
      >
        <FileText
          aria-hidden
          className='text-muted-foreground size-4 shrink-0'
        />
        <span className='min-w-0'>
          <span className='block truncate text-sm font-medium'>
            Event Terms
          </span>
          <span className='text-muted-foreground block truncate text-xs'>
            /terms
            {updatedAt && (
              <>
                {' '}
                · updated <LocalDateTime value={updatedAt} dateStyle='medium' />
              </>
            )}
          </span>
        </span>
      </Link>

      {canManageEvent && (
        <Button
          asChild
          variant='ghost'
          size='icon-sm'
          className='relative shrink-0'
        >
          <Link
            href={`${basePath}/settings/terms`}
            aria-label='Edit Event Terms'
          >
            <Pencil className='size-4' />
          </Link>
        </Button>
      )}
    </div>
  );
}
