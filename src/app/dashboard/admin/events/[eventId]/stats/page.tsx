import * as React from 'react';
import { redirect } from 'next/navigation';

import { getApplicationStats } from '@/app/dashboard/admin/events/actions';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { ApplicationStatsView } from './application-stats-view';

type StatsPageProps = {
  params: Promise<{ eventId: string }>;
};

/**
 * The deep-dive counterpart to the dashboard's summary cells: status
 * filtering, demographics, and every report-flagged question. Sync shell so
 * the segment keeps its static shell — see `questions/page.tsx`.
 */
export default function StatsPage({ params }: StatsPageProps) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <StatsContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function StatsContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId } = await paramsPromise;
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'application:stats');

  const result = await getApplicationStats(eventId);
  if (!result.success || !result.data) {
    return (
      <div className='text-destructive'>
        {!result.success ? result.error : 'Event not found'}
      </div>
    );
  }

  return <ApplicationStatsView eventId={eventId} initialStats={result.data} />;
}
