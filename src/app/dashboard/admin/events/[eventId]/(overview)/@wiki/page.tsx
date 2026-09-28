import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink, FileText, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAllArticlesForAdmin } from '@/lib/event-wiki';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { BentoCard, BentoCardSkeleton } from '../../_components/bento-card';

type Props = { params: Promise<{ eventId: string }> };

export default function WikiCell({ params }: Props) {
  return (
    <React.Suspense fallback={<BentoCardSkeleton rows={4} />}>
      <WikiSection paramsPromise={params} />
    </React.Suspense>
  );
}

async function WikiSection({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId } = await paramsPromise;
  const user = await getUser();
  if (!user) redirect('/signin');

  const [canRead, canWrite] = await Promise.all([
    hasPermission(user.id, 'article:read:all'),
    hasPermission(user.id, 'article:write:all'),
  ]);
  if (!canRead) return null;

  // Only fetched once the viewer is known to be allowed to see drafts.
  const articles = await getAllArticlesForAdmin(eventId);
  const base = `/dashboard/admin/events/${eventId}`;

  return (
    <BentoCard
      title='Wiki articles'
      contentClassName='p-0'
      action={
        canWrite ? (
          <Button asChild variant='ghost' size='sm'>
            <Link href={`${base}/wiki`}>
              <Plus aria-hidden className='size-4' />
              Add
            </Link>
          </Button>
        ) : undefined
      }
    >
      {articles.length === 0 ? (
        <p className='text-muted-foreground px-6 py-5 text-sm'>
          No articles yet.
        </p>
      ) : (
        <ul className='m-0 list-none divide-y p-0'>
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={`${base}/wiki?article=${article.id}`}
                className='hover:bg-accent/50 flex items-center gap-3 px-6 py-3 text-sm'
              >
                <FileText
                  aria-hidden
                  className='text-muted-foreground size-4 shrink-0'
                />
                <span className='min-w-0 flex-1 truncate'>{article.title}</span>
                {!article.published && <Badge variant='secondary'>Draft</Badge>}
                <ExternalLink
                  aria-hidden
                  className='text-muted-foreground size-4 shrink-0'
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}
