import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';

import { Skeleton } from '@/components/ui/skeleton';
import { getAdminEventHeader } from '@/lib/admin-event';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';
import { DescriptionForm } from './description-form';

type Props = { params: Promise<{ eventId: string }> };

export default function DescriptionPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className='h-96 rounded-xl' />}>
      <DescriptionContent params={params} />
    </Suspense>
  );
}

async function DescriptionContent({ params }: Props) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'event:manage');

  const event = await getAdminEventHeader(eventId);
  if (!event) notFound();

  return (
    <DescriptionForm
      key={eventId}
      eventId={eventId}
      initialMarkdown={event.descriptionMarkdown}
    />
  );
}
