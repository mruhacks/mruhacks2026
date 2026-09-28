import { redirect } from 'next/navigation';
import { getUser } from '@/utils/auth';
import { requirePermission } from '@/lib/rbac/authorization';
import { getApplicationStats } from '@/app/dashboard/admin/events/actions';
import { ApplicationStatsView } from './application-stats-view';

type StatsPageProps = {
  params: Promise<{ eventId: string }>;
};

/**
 * Parallel-route slot pages are their own instant-navigation segment. This
 * one reads the session and aggregate application stats from the DB, so it
 * must be allowed to block. It does not inherit `instant = false` from the
 * event layout.
 */
export const instant = false;

export default async function StatsPage({ params }: StatsPageProps) {
  const { eventId } = await params;
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

  return (
    <ApplicationStatsView eventId={eventId} initialStats={result.data} />
  );
}
