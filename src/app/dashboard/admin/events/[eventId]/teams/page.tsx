import * as React from 'react';
import { notFound } from 'next/navigation';

import { resolveEventId } from '@/lib/events';

import { TeamsPage } from './teams-page';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Sync shell, with the segment resolution behind the boundary — the same
 * shape as every other page under this event. It turns a custom slug in the
 * URL into the event's uuid before the client page queries teams with it.
 */
export default function TeamsRoute({ params }: Props) {
  return (
    <React.Suspense fallback={<TeamsSkeleton />}>
      <TeamsContent paramsPromise={params} />
    </React.Suspense>
  );
}

function TeamsSkeleton() {
  return (
    <div className='text-muted-foreground py-8 text-center'>Loading...</div>
  );
}

async function TeamsContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();

  return <TeamsPage eventId={eventId} />;
}
