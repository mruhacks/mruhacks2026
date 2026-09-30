import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';

import { Skeleton } from '@/components/ui/skeleton';
import { getAdminEventHeader } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';
import { EventContentForm } from '../event-content-form';

type Props = { params: Promise<{ eventId: string }> };

export default function TermsPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className='h-96 rounded-xl' />}>
      <TermsContent params={params} />
    </Suspense>
  );
}

async function TermsContent({ params }: Props) {
  const { eventId: segment } = await params;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'event:manage');

  const event = await getAdminEventHeader(eventId);
  if (!event) notFound();

  return (
    <EventContentForm
      key={eventId}
      eventId={eventId}
      kind='terms'
      initialMarkdown={event.termsMarkdown ?? ''}
    />
  );
}
