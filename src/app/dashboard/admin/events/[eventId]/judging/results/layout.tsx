import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import { getJudgingResults } from '@/app/dashboard/admin/events/judging-actions';
import { Card } from '@/components/ui/card';
import { resolveEventId } from '@/lib/events';
import * as Rbac from '@/lib/rbac/server';
import { getUser } from '@/utils/auth';

import { ResultsHeader } from './_components/results-header';
import { ResultsProvider } from './_components/results-context';

type Props = {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
};

/**
 * Live expo results. `judging:results:all` sees the rankings;
 * `judging:award:all` records placements — from the ranked Overall table when
 * they can see it, from a plain list when they can't.
 *
 * Results are loaded and polled here rather than per page, so switching
 * between tables reuses what's already on screen instead of replaying every
 * vote again.
 */
export default function JudgingResultsLayout({ children, params }: Props) {
  return (
    <React.Suspense fallback={<div className='bg-muted h-64 animate-pulse rounded-xl' />}>
      <ResultsShell paramsPromise={params}>{children}</ResultsShell>
    </React.Suspense>
  );
}

async function ResultsShell({
  children,
  paramsPromise,
}: {
  children: React.ReactNode;
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  // Either permission opens the section; `getJudgingResults` decides what's
  // in it, and the ranking-only pages gate themselves.
  await Rbac.requireAnyPermission(user.id, ['judging:results:all', 'judging:award:all']);

  const result = await getJudgingResults(eventId);
  if (!result.success || !result.data) {
    return <p className='text-destructive'>{!result.success ? result.error : 'Failed to load results.'}</p>;
  }

  return (
    <ResultsProvider eventId={eventId} initial={result.data}>
      <Card className='gap-4 p-6'>
        <ResultsHeader />
        {children}
      </Card>
    </ResultsProvider>
  );
}
