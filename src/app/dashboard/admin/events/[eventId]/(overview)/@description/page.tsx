import * as React from 'react';
import { redirect } from 'next/navigation';

import { MarkdownContent } from '@/components/markdown/markdown-content';
import { getAdminEventHeader } from '@/lib/admin-event';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { BentoCard, BentoCardSkeleton } from '../../_components/bento-card';
import { EventDescriptionCard } from '../../_components/event-description-card';

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
  const { eventId } = await paramsPromise;
  const user = await getUser();
  if (!user) redirect('/signin');

  const [event, canManage] = await Promise.all([
    getAdminEventHeader(eventId),
    hasPermission(user.id, 'event:manage:all'),
  ]);

  if (!event) return null;

  // Authored in place rather than behind a link to /settings — the card is
  // already the read view, and its editor core is a dynamic import, so the
  // MDX bundle only loads once Edit is pressed. Keyed by event so the editor
  // can't open on a stale draft.
  if (canManage) {
    return (
      <EventDescriptionCard
        key={event.id}
        eventId={event.id}
        initialMarkdown={event.descriptionMarkdown}
      />
    );
  }

  return (
    <BentoCard title='Description'>
      {event.descriptionMarkdown ? (
        <MarkdownContent markdown={event.descriptionMarkdown} />
      ) : (
        <p className='text-muted-foreground text-sm'>No description yet.</p>
      )}
    </BentoCard>
  );
}
