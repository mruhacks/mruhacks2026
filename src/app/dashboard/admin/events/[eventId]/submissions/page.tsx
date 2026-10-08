import * as React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { listEventSubmissions } from '@/app/dashboard/events/submission-actions';
import { LocalDateTime } from '@/components/local-date-time';
import { SubmissionStatusBadge } from '@/components/submissions/submission-view';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAdminEventHeader } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { requirePermission } from '@/lib/rbac/authorization';
import { isSubmissionsEnabled } from '@/lib/submissions';
import { getUser } from '@/utils/auth';

type Props = { params: Promise<{ eventId: string }> };

/**
 * Every team's project for the event, drafts included — read-only. Sync
 * shell, with the session and reads behind Suspense like every page here.
 */
export default function SubmissionsRoute({ params }: Props) {
  return (
    <React.Suspense
      fallback={<div className='bg-muted h-64 animate-pulse rounded-xl' />}
    >
      <SubmissionsContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function SubmissionsContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  // The same permission `listEventSubmissions` checks, and the one the
  // dashboard's Projects tile is shown on.
  await requirePermission(user.id, 'submission:read:all');

  const [event, result] = await Promise.all([
    getAdminEventHeader(eventId),
    listEventSubmissions(eventId),
  ]);
  if (!event) notFound();
  if (!result.success || !result.data) {
    return (
      <p className='text-destructive'>
        {!result.success ? result.error : 'Failed to load submissions.'}
      </p>
    );
  }
  const rows = result.data;
  const backHref = `/dashboard/admin/events/${segment}/submissions`;

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <h2 className='text-xl font-semibold'>Projects</h2>
        <p className='text-muted-foreground text-sm'>
          {isSubmissionsEnabled(event) && event.submissionsCloseAt ? (
            <>
              Submissions close{' '}
              <LocalDateTime
                value={event.submissionsCloseAt}
                dateStyle='medium'
                timeStyle='short'
                timeZoneName='short'
              />
              . Drafts at the deadline won&apos;t be judged.
            </>
          ) : (
            'This event is not set up for project submissions.'
          )}
        </p>
      </div>

      <Card className='py-0'>
        {rows.length === 0 ? (
          <p className='text-muted-foreground p-6 text-center text-sm'>
            No team has started a project yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last edited</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='font-medium'>
                    <Link
                      href={{
                        pathname: `/dashboard/events/${segment}/projects/${row.id}`,
                        query: { back: backHref },
                      }}
                      className='hover:underline'
                    >
                      {row.title}
                    </Link>
                  </TableCell>
                  <TableCell className='text-muted-foreground whitespace-normal'>
                    {row.members.length > 0
                      ? row.members.join(', ')
                      : 'No remaining members'}
                  </TableCell>
                  <TableCell>
                    <SubmissionStatusBadge published={row.published} />
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    <LocalDateTime
                      value={row.updatedAt}
                      dateStyle='medium'
                      timeStyle='short'
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
