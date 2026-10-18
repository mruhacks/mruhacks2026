import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import { getJudgingProjects } from '@/app/dashboard/admin/events/judging-actions';
import { resolveEventId } from '@/lib/events';
import { hasPermission, requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { JudgingProjectsTable } from './projects-table';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Every submission with its expo table, and the switch that takes one out of
 * judging. Sync shell, with the session and reads behind Suspense like every
 * page here.
 */
export default function JudgingProjectsRoute({ params }: Props) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-64 animate-pulse rounded-xl' />}
    >
      <ProjectsContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function ProjectsContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  // The same permission deactivating a project checks.
  await requirePermission(user.id, 'judging:manage:all');

  const [result, canViewProjects] = await Promise.all([
    getJudgingProjects(eventId),
    // The project page itself gates on this; only link where it would open.
    hasPermission(user.id, 'submission:read:all'),
  ]);
  if (!result.success || !result.data) {
    return (
      <p className='text-destructive'>
        {!result.success ? result.error : 'Failed to load projects.'}
      </p>
    );
  }

  return (
    <JudgingProjectsTable
      eventId={eventId}
      segment={segment}
      projects={result.data}
      canViewProjects={canViewProjects}
    />
  );
}
