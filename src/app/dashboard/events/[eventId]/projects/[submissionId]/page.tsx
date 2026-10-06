import * as React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  canDeleteAnySubmission,
  getEventSubmission,
} from '@/app/dashboard/events/submission-actions';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { SubmissionView } from '@/components/submissions/submission-view';
import { Button } from '@/components/ui/button';
import { getAdminEventHeader } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';
import { sanitizeReturnPath } from '@/utils/return-path';

import { AdminDeleteSubmissionButton } from './admin-delete-submission-button';

type Props = {
  params: Promise<{ eventId: string; submissionId: string }>;
  /** `back`: where the back link (and a delete) returns to. */
  searchParams: Promise<{ back?: string | string[] }>;
};

/** Session and DB reads stream in behind Suspense — see the event page. */
export const instant = false;

/**
 * One team's project, read-only; drafts included. Lives outside the admin
 * event dashboard so it reads like the team's own project page, without that
 * section's event header — but is still gated on `submission:read:all`.
 */
export default function SubmissionRoute({ params, searchParams }: Props) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <SubmissionContent
        paramsPromise={params}
        searchParamsPromise={searchParams}
      />
    </React.Suspense>
  );
}

async function SubmissionContent({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Props['params'];
  searchParamsPromise: Props['searchParams'];
}) {
  const [{ eventId: segment, submissionId }, { back }] = await Promise.all([
    paramsPromise,
    searchParamsPromise,
  ]);
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'submission:read:all');

  const [result, canDelete, event] = await Promise.all([
    getEventSubmission(eventId, submissionId),
    canDeleteAnySubmission(),
    getAdminEventHeader(eventId),
  ]);
  if (!result.success || !result.data || !event) notFound();
  const submission = result.data;

  // Whoever links here says where "back" goes (`?back=`); without one, the
  // event page is the one place every viewer can reach.
  const backHref = sanitizeReturnPath(
    typeof back === 'string' ? back : null,
    `/dashboard/events/${segment}`,
  );

  return (
    <div className='flex flex-col gap-3'>
      {/* Zero-render: feed the event's name and the project's title to the
          dashboard breadcrumb, which otherwise shows the raw segments. */}
      <BreadcrumbSegment id={segment} label={event.name} />
      <BreadcrumbSegment id={submissionId} label={submission.title} />
      <Button
        asChild
        variant='ghost'
        size='sm'
        className='text-muted-foreground -ml-2 w-fit'
      >
        <Link href={backHref}>
          <ArrowLeft data-icon='inline-start' />
          Back
        </Link>
      </Button>

      <SubmissionView
        submission={submission}
        members={submission.members}
        action={
          canDelete && (
            <AdminDeleteSubmissionButton
              eventId={eventId}
              submissionId={submission.id}
              title={submission.title}
              backHref={backHref}
            />
          )
        }
      />
    </div>
  );
}
