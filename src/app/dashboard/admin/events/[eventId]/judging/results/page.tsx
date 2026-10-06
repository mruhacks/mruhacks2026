import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import { getJudgingResults } from '@/app/dashboard/admin/events/judging-actions';
import { resolveEventId } from '@/lib/events';
import { requireAnyPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { ResultsView } from './results-view';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Live expo results. `judging:results:all` sees the rankings;
 * `judging:award:all` flags finalists and records placements — from the
 * ranked tables when they can see them, from a plain list when they can't.
 */
export default function JudgingResultsRoute({ params }: Props) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-64 animate-pulse rounded-xl' />}
    >
      <ResultsContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function ResultsContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  // Either permission opens the page; `getJudgingResults` decides what's in it.
  await requireAnyPermission(user.id, [
    'judging:results:all',
    'judging:award:all',
  ]);

  const result = await getJudgingResults(eventId);
  if (!result.success || !result.data) {
    return (
      <p className='text-destructive'>
        {!result.success ? result.error : 'Failed to load results.'}
      </p>
    );
  }

  return <ResultsView eventId={eventId} initial={result.data} />;
}
