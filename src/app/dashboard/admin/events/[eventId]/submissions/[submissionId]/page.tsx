import * as React from 'react';
import { notFound, redirect } from 'next/navigation';

import {
  canDeleteAnySubmission,
  getEventSubmission,
} from '@/app/dashboard/events/submission-actions';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { SubmissionView } from '@/components/submissions/submission-view';
import { Card } from '@/components/ui/card';
import { resolveEventId } from '@/lib/events';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { AdminDeleteSubmissionButton } from './admin-delete-submission-button';

type Props = {
  params: Promise<{ eventId: string; submissionId: string }>;
};

/** One team's project, read-only; drafts included. */
export default function SubmissionRoute({ params }: Props) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <SubmissionContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function SubmissionContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment, submissionId } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'submission:read:all');

  const [result, canDelete] = await Promise.all([
    getEventSubmission(eventId, submissionId),
    canDeleteAnySubmission(),
  ]);
  if (!result.success || !result.data) notFound();
  const submission = result.data;

  return (
    <Card className='gap-6 p-6'>
      {/* Zero-render: feeds the project's title to the dashboard breadcrumb,
          which otherwise shows the raw uuid. */}
      <BreadcrumbSegment id={submissionId} label={submission.title} />
      <SubmissionView submission={submission} members={submission.members} />
      {canDelete && (
        <div className='flex justify-end border-t pt-4'>
          <AdminDeleteSubmissionButton
            eventId={eventId}
            submissionId={submission.id}
            title={submission.title}
            listHref={`/dashboard/admin/events/${segment}/submissions`}
          />
        </div>
      )}
    </Card>
  );
}
