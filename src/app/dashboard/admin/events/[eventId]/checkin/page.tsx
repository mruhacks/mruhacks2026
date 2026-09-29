import * as React from 'react';
import { notFound } from 'next/navigation';

import { resolveEventId } from '@/lib/events';

import { CheckInPage } from './check-in-page';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Sync shell so the segment keeps its static shell; the segment resolution
 * lives behind the boundary, like every other page under this event.
 *
 * Its only job is turning the `[eventId]` segment — a uuid or the event's
 * custom slug — into the uuid the check-in actions expect. Permissions are
 * enforced by those actions, which is also what gates this page today.
 */
export default function CheckInRoute({ params }: Props) {
  return (
    <React.Suspense fallback={<CheckInSkeleton />}>
      <CheckInContent paramsPromise={params} />
    </React.Suspense>
  );
}

function CheckInSkeleton() {
  return (
    <div className='text-muted-foreground py-8 text-center'>Loading...</div>
  );
}

async function CheckInContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();

  return <CheckInPage eventId={eventId} />;
}
