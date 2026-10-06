import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { getMySubmission } from '@/app/dashboard/events/submission-actions';
import { LocalDateRange, LocalDateTime } from '@/components/local-date-time';
import { SubmissionStatusBadge } from '@/components/submissions/submission-view';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * The event page's entry point to the team's project. Renders nothing for
 * anyone `getMySubmission` refuses — an event without submissions, or a
 * participant not yet eligible (e.g. not checked in) — so ineligible
 * teammates never learn a draft exists.
 */
export async function ProjectPanel({
  eventId,
  eventHref,
}: {
  eventId: string;
  eventHref: string;
}) {
  const result = await getMySubmission(eventId);
  if (!result.success || !result.data) return null;
  const { submissionWindow, opensAt, closesAt, submission } = result.data;

  const action =
    submissionWindow === 'open'
      ? submission
        ? 'Edit project'
        : 'Start project'
      : submissionWindow === 'closed' && submission
        ? 'View project'
        : null;

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-base'>Project</CardTitle>
          {submission && (
            <SubmissionStatusBadge published={submission.published} />
          )}
        </div>
        <CardDescription>
          {submissionWindow === 'closed' ? (
            submission ? (
              'Submissions are closed. Your project is final.'
            ) : (
              "Submissions are closed. Your team didn't submit a project."
            )
          ) : (
            <>
              Submissions open <LocalDateRange start={opensAt} end={closesAt} />
            </>
          )}
        </CardDescription>
      </CardHeader>
      {submissionWindow === 'open' && (
        <CardContent className='flex flex-col gap-2 text-sm'>
          {submission && (
            <p className='truncate font-medium'>{submission.title}</p>
          )}
          {(!submission || !submission.published) && (
            <p className='flex items-start gap-2 text-amber-700 dark:text-amber-300'>
              <AlertTriangle className='mt-0.5 size-4 shrink-0' aria-hidden />
              <span>
                Private projects won&apos;t be judged. Make it public before{' '}
                <LocalDateTime
                  value={closesAt}
                  dateStyle='medium'
                  timeStyle='short'
                />
                .
              </span>
            </p>
          )}
        </CardContent>
      )}
      {action && (
        <CardFooter>
          <Button asChild className='w-full'>
            <Link href={`${eventHref}/project`}>{action}</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
