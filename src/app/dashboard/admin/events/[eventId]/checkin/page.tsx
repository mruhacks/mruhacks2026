import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';
import { hasEventElapsed, resolveEventId } from '@/lib/events';
import { getAdminEventHeader } from '@/lib/admin-event';
import { getParentEventId, listSubevents } from '@/lib/subevents';
import { serializeInstant } from '@/lib/datetime';

import { CheckInPage } from './check-in-page';
import type { CheckInTargetOption } from './check-in-target-selector';

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ target?: string | string[] }>;
};

/**
 * Sync shell so the segment keeps its static shell; the segment resolution
 * lives behind the boundary, like every other page under this event.
 *
 * Its only job is turning the `[eventId]` segment — a uuid or the event's
 * custom slug — into the uuid the check-in actions expect, and reading the
 * armed sub-event out of `?target=`. Permissions are enforced by those actions,
 * which is also what gates this page today.
 *
 * `searchParams` is passed down as a promise rather than awaited here, for the
 * same reason `params` is: awaiting either at the top level would collapse this
 * segment's App Shell.
 */
export default function CheckInRoute({ params, searchParams }: Props) {
  return (
    <React.Suspense fallback={<CheckInSkeleton />}>
      <CheckInContent
        paramsPromise={params}
        searchParamsPromise={searchParams}
      />
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
  await requirePermission(user.id, 'checkin:write:all');

  // A sub-event has no check-in desk of its own: its roster is the parent's and
  // the passes are the parent's. Arriving here from a sub-event's own admin
  // shell sends you to the real desk with that sub-event already armed, rather
  // than to the "only available for main events" dead end the roster would
  // otherwise return.
  const parentEventId = await getParentEventId(eventId);
  if (parentEventId) {
    redirect(
      `/dashboard/admin/events/${parentEventId}/checkin?target=${eventId}`,
    );
  }

  const { target: rawTarget } = await searchParamsPromise;
  // A repeated `?target=` arrives as an array; take the first.
  const requestedTarget = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;

  const [event, subeventRows] = await Promise.all([
    getAdminEventHeader(eventId),
    listSubevents(eventId),
  ]);
  if (!event) notFound();
  if (!event.checkInEnabled) return <p>Check-in is disabled for this event.</p>;

  const subevents: CheckInTargetOption[] = subeventRows
    .filter((row) => row.checkInEnabled)
    .map((row) => ({
      id: row.id,
      name: row.name,
      startsAt: row.startsAt ? serializeInstant(row.startsAt) : null,
      endsAt: row.endsAt ? serializeInstant(row.endsAt) : null,
      location: row.location,
    }));

  const armed =
    requestedTarget && requestedTarget !== eventId
      ? subevents.find((subevent) => subevent.id === requestedTarget)
      : undefined;

  // An unrecognised target is reported, never quietly swapped for the door.
  // Silently arming something other than what the URL asked for is the exact
  // mistake this whole surface is built to prevent.
  const unknownTarget = Boolean(
    requestedTarget && requestedTarget !== eventId && !armed,
  );

  return (
    <CheckInPage
      // Remounts on every target change, which discards the roster, the last
      // scan's feedback and the polling watermarks in one move — a stale green
      // "checked in" banner sitting under a newly armed target is exactly the
      // confusion that leads to scanning the wrong thing.
      key={armed?.id ?? eventId}
      eventId={eventId}
      eventName={event.name}
      subevents={subevents}
      targetId={armed?.id ?? eventId}
      unknownTarget={unknownTarget}
      hasEnded={hasEventElapsed(event.endsAt)}
    />
  );
}
