import * as React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Trophy } from 'lucide-react';

import { getJudgingAdmin } from '@/app/dashboard/admin/events/judging-actions';
import { Button } from '@/components/ui/button';
import { getAdminEventHeader } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { hasPermission, requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { CriteriaCard } from './criteria-card';
import { JudgingProjectsCard } from './projects-card';
import { RosterCard } from './roster-card';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Expo judging setup: criteria, the judge roster, and which projects are in
 * play. Sync shell, with the session and reads behind Suspense like every
 * page here.
 */
export default function JudgingRoute({ params }: Props) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-64 animate-pulse rounded-xl' />}
    >
      <JudgingContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function JudgingContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  // The same permission every action on this page checks.
  await requirePermission(user.id, 'judging:manage:all');

  const [event, result, canViewResults, canAward] = await Promise.all([
    getAdminEventHeader(eventId),
    getJudgingAdmin(eventId),
    hasPermission(user.id, 'judging:results:all'),
    hasPermission(user.id, 'judging:award:all'),
  ]);
  if (!event) notFound();
  if (!result.success || !result.data) {
    return (
      <p className='text-destructive'>
        {!result.success ? result.error : 'Failed to load judging.'}
      </p>
    );
  }
  const data = result.data;

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h2 className='text-xl font-semibold'>Judging</h2>
          <p className='text-muted-foreground text-sm'>
            Judges walk the expo comparing projects two at a time, from the
            event&apos;s start to its end. The app tells each judge which table
            to visit next.
          </p>
        </div>
        {/* The results page serves both rankings and awards. */}
        {(canViewResults || canAward) && (
          <Button asChild variant='outline'>
            <Link href={`/dashboard/admin/events/${segment}/judging/results`}>
              <Trophy aria-hidden />
              {canViewResults ? 'Results' : 'Awards'}
            </Link>
          </Button>
        )}
      </div>

      <CriteriaCard
        eventId={eventId}
        criteria={data.criteria}
        structureLocked={data.structureLocked}
      />
      <RosterCard eventId={eventId} judges={data.judges} />
      <JudgingProjectsCard eventId={eventId} projects={data.projects} />
    </div>
  );
}
