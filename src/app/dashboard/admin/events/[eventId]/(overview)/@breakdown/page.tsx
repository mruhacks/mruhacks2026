import * as React from 'react';
import { redirect } from 'next/navigation';

import { getEventApplicationStats } from '@/lib/admin-event';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { BentoCardSkeleton } from '../../_components/bento-card';
import { QuestionStatsGrid } from '../../_components/question-stats-grid';

type Props = { params: Promise<{ eventId: string }> };

export default function BreakdownCell({ params }: Props) {
  return (
    <React.Suspense fallback={<BreakdownSkeleton />}>
      <BreakdownSection paramsPromise={params} />
    </React.Suspense>
  );
}

function BreakdownSkeleton() {
  return (
    <section className='space-y-4'>
      <div className='bg-muted h-7 w-72 animate-pulse rounded-sm' />
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        {[0, 1, 2, 3].map((i) => (
          <BentoCardSkeleton key={i} rows={4} />
        ))}
      </div>
    </section>
  );
}

async function BreakdownSection({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId } = await paramsPromise;
  const user = await getUser();
  if (!user) redirect('/signin');

  if (!(await hasPermission(user.id, 'application:stats'))) return null;

  // Shares the cache entry the applications cell already filled — same
  // eventId, same cached function, so this is a hit rather than a re-scan.
  const stats = await getEventApplicationStats(eventId);
  if (!stats || stats.questionStats.length === 0) return null;

  // Which cards are shown is a per-admin browser preference, so the choosing
  // happens on the client; the server always sends the full set.
  return <QuestionStatsGrid eventId={eventId} questions={stats.questionStats} />;
}
