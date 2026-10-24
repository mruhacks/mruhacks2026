import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import { getAdminEventSettings } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { hasPermission, requireAnyPermission } from '@/lib/rbac/authorization';
import { isSubmissionsEnabled } from '@/lib/submissions';
import { getUser } from '@/utils/auth';

import { TeamsPage } from './teams-page';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Teams, their projects and each project's expo table on one screen. Sync shell, with the segment
 * resolution behind the boundary — the same shape as every other page under
 * this event. It turns a custom slug in the URL into the event's uuid before
 * the client page queries teams and projects with it.
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
  // Any part of the screen is enough to land here — the same permissions
  // `getFormedTeamsForEvent`, `listEventSubmissions` and `getJudgingProjects`
  // check. Each part is then gated on its own.
  await requireAnyPermission(user.id, [
    'team:read:all',
    'submission:read:all',
    'judging:manage:all',
  ]);

  const [event, canReadTeams, canReadSubmissions, canManageJudging] =
    await Promise.all([
      getAdminEventSettings(eventId),
      hasPermission(user.id, 'team:read:all'),
      hasPermission(user.id, 'submission:read:all'),
      hasPermission(user.id, 'judging:manage:all'),
    ]);
  if (!event) notFound();
  const submissionsEnabled = isSubmissionsEnabled(event);

  return (
    <TeamsPage
      eventId={eventId}
      segment={segment}
      showTeams={canReadTeams && event.teamsEnabled}
      showProjects={canReadSubmissions && submissionsEnabled}
      showJudging={canManageJudging && submissionsEnabled}
      maxTeamSize={event.maxTeamSize}
    />
  );
}
