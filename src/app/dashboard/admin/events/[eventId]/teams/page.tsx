import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import { getAdminEventSettings } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

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
  const user = await getUser();
  if (!user) redirect('/signin');
  // The same permission `getFormedTeamsForEvent` checks, and the one the
  // dashboard's Teams tile is shown on.
  await requirePermission(user.id, 'team:read:all');

  const event = await getAdminEventSettings(eventId);
  if (!event) notFound();

  return (
    <TeamsPage
      eventId={eventId}
      teamsEnabled={event.teamsEnabled}
      maxTeamSize={event.maxTeamSize}
    />
  );
}
