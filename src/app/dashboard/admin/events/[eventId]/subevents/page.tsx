import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import { serializeInstant } from '@/lib/datetime';
import { getAdminEventHeader } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { hasPermission } from '@/lib/rbac/authorization';
import { getSubeventCheckInCounts, listSubevents } from '@/lib/subevents';
import { getUser } from '@/utils/auth';

import { BentoCardSkeleton } from '../_components/bento-card';
import { SubeventList } from './subevent-list';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Sync shell, with the segment resolution behind the boundary — the same shape
 * as every other page under this event.
 */
export default function SubeventsRoute({ params }: Props) {
  return (
    <React.Suspense fallback={<BentoCardSkeleton rows={4} />}>
      <SubeventsContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function SubeventsContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();

  const user = await getUser();
  if (!user) redirect('/signin');
  // Sub-events are `events` rows, so managing them is the same authority as
  // managing any other part of an event — not a bundle, and not a new slug for
  // something this permission already covers.
  if (!(await hasPermission(user.id, 'event:manage'))) return null;

  const [event, subevents] = await Promise.all([
    getAdminEventHeader(eventId),
    listSubevents(eventId),
  ]);
  if (!event) notFound();

  const checkInCounts = await getSubeventCheckInCounts(
    subevents.map((subevent) => subevent.id),
  );

  return (
    <SubeventList
      eventId={eventId}
      segment={segment}
      eventStartsAt={event.startsAt ? serializeInstant(event.startsAt) : null}
      subevents={subevents}
      checkInCounts={checkInCounts}
    />
  );
}
