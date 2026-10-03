import * as React from 'react';
import { notFound } from 'next/navigation';

import { resolveEventId } from '@/lib/events';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { EventRsvpPage } from './rsvp-page';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Sync shell, with the segment resolution behind the boundary — the same
 * shape as every other page under this event. It exists to turn a custom
 * slug in the URL into the event's uuid before the client page starts
 * calling the RSVP actions with it.
 */
export default function EventRsvpRoute({ params }: Props) {
  return (
    <React.Suspense fallback={<RsvpSkeleton />}>
      <RsvpContent paramsPromise={params} />
    </React.Suspense>
  );
}

function RsvpSkeleton() {
  return (
    <div className='text-muted-foreground py-8 text-center'>Loading...</div>
  );
}

async function RsvpContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const [eventId, user] = await Promise.all([
    resolveEventId(segment),
    getUser(),
  ]);
  if (!eventId) notFound();

  // Reordering the waitlist and closing an open wave early both override who
  // gets (or keeps) an RSVP, so they're gated on `rsvp:write:all`; the
  // actions re-check it.
  const canManageRsvp = user
    ? await hasPermission(user.id, 'rsvp:write:all')
    : false;

  return <EventRsvpPage eventId={eventId} canManageRsvp={canManageRsvp} />;
}
