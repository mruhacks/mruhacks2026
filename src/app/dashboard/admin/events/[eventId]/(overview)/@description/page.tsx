import * as React from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { redirect } from 'next/navigation';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import { getAdminEventHeader } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { BentoCard, BentoCardSkeleton } from '../../_components/bento-card';

type Props = { params: Promise<{ eventId: string }> };

export default function DescriptionCell({ params }: Props) {
  return (
    <React.Suspense fallback={<BentoCardSkeleton rows={5} />}>
      <DescriptionSection paramsPromise={params} />
    </React.Suspense>
  );
}

async function DescriptionSection({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) return null;
  const user = await getUser();
  if (!user) redirect('/signin');

  const [event, canManage] = await Promise.all([
    getAdminEventHeader(eventId),
    hasPermission(user.id, 'event:manage:all'),
  ]);

  if (!event) return null;

  return (
    <BentoCard
      title='Description'
      action={
        canManage ? (
          <Button asChild variant='ghost' size='icon'>
            <Link
              href={`/dashboard/admin/events/${segment}/settings/description`}
              aria-label='Edit description'
              title='Edit description'
            >
              <Pencil aria-hidden />
            </Link>
          </Button>
        ) : undefined
      }
    >
      {event.descriptionMarkdown ? (
        <MarkdownContent markdown={event.descriptionMarkdown} />
      ) : (
        <p className='text-muted-foreground text-sm'>No description yet.</p>
      )}
    </BentoCard>
  );
}
