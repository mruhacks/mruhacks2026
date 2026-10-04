import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import { getAdminEventSettings } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { hasPermission, requirePermission } from '@/lib/rbac/authorization';
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
  if (!user) redirect('/signin');
  // The same permission the read actions behind this page check, and the one
  // the dashboard's RSVP tile is shown on.
  await requirePermission(user.id, 'rsvp:read:all');

  const [event, canManageEvent, canManageRsvp] = await Promise.all([
    getAdminEventSettings(eventId),
    // Sending a wave, resending an invitation and the response window are
    // event management; the actions re-check it.
    hasPermission(user.id, 'event:manage:all'),
    // Closing an open wave early overrides who keeps an RSVP, so it's gated
    // on `rsvp:write:all`; the action re-checks it.
    hasPermission(user.id, 'rsvp:write:all'),
  ]);
  if (!event) notFound();

  return (
    <EventRsvpPage
      eventId={eventId}
      hasApplication={event.hasApplication}
      rsvpResponseWindowHours={event.rsvpResponseWindowHours}
      canManageEvent={canManageEvent}
      canManageRsvp={canManageRsvp}
    />
  );
}
