import * as React from 'react';
import { redirect } from 'next/navigation';

import { getAllArticlesForAdmin } from '@/lib/event-wiki';
import { resolveEventId } from '@/lib/events';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { BentoCard, BentoCardSkeleton } from '../../_components/bento-card';
import { CreateArticleDialog } from './create-article-dialog';
import { WikiArticleRow } from './wiki-article-row';

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
 * under the event. Each row's controls are client components; the list itself
 * stays server-rendered so a mutation's revalidation refreshes it.
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

  const [canRead, canWrite] = await Promise.all([
    hasPermission(user.id, 'article:read:all'),
    hasPermission(user.id, 'article:write:all'),
  ]);
  if (!canRead) return null;

  // Only fetched once the viewer is known to be allowed to see drafts.
  const articles = await getAllArticlesForAdmin(eventId);

  return (
    <BentoCard
      title='Wiki articles'
      contentClassName='p-0'
      action={canWrite ? <CreateArticleDialog eventId={eventId} /> : undefined}
    >
      {articles.length === 0 ? (
        <p className='text-muted-foreground px-6 py-5 text-sm'>
          No articles yet.
          {canWrite ? ' Add one to start the wiki.' : ''}
        </p>
      ) : (
        <ul className='m-0 list-none divide-y p-0'>
          {articles.map((article) => (
            <li key={article.id}>
              <WikiArticleRow
                eventId={eventId}
                article={article}
                canWrite={canWrite}
              />
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}
