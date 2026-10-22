import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import { parseMissedThreshold } from '@/lib/dietary/report';
import { resolveEventId } from '@/lib/events';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { DietaryPage } from './dietary-page';

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ missed?: string | string[] }>;
};

export default function DietaryRoute({ params, searchParams }: Props) {
  return (
    <React.Suspense fallback={<DietarySkeleton />}>
      <DietaryContent paramsPromise={params} searchParamsPromise={searchParams} />
    </React.Suspense>
  );
}

function DietarySkeleton() {
  return <div className='text-muted-foreground py-8 text-center'>Loading...</div>;
}

async function DietaryContent({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Props['params'];
  searchParamsPromise: Props['searchParams'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'dietary:read:all');

  const { missed } = await searchParamsPromise;

  return <DietaryPage eventId={eventId} threshold={parseMissedThreshold(missed)} />;
}
