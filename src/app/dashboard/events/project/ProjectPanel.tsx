import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { getMySubmission } from '@/app/dashboard/events/submission-actions';
import { LocalDateTime } from '@/components/local-date-time';
import { SubmissionStatusBadge } from '@/components/submissions/submission-view';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { ProjectStatusToggle } from './project-status-toggle';

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
  const { submissionWindow, closesAt, submission } = result.data;

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
          <CardTitle className='min-w-0 truncate text-base'>
            Project{submission && `: ${submission.title}`}
          </CardTitle>
          {submission &&
            (submissionWindow === 'open' ? (
              <ProjectStatusToggle
                eventId={eventId}
                published={submission.published}
              />
            ) : (
              <SubmissionStatusBadge published={submission.published} />
            ))}
        </div>
        {submissionWindow === 'open' && !submission?.published && (
          <p className='flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300'>
            <AlertTriangle className='mt-0.5 size-4 shrink-0' aria-hidden />
            <span>
              Private projects won&apos;t be judged. Make it public before
              submissions close.
            </span>
          </p>
        )}
        <CardDescription>
          {submissionWindow === 'closed' ? (
            submission ? (
              'Submissions are closed. Your project is final.'
            ) : (
              "Submissions are closed. Your team didn't submit a project."
            )
          ) : (
            <>
              Submissions close{' '}
              <LocalDateTime
                value={closesAt}
                dateStyle='medium'
                timeStyle='short'
                timeZoneName='short'
              />
            </>
          )}
        </CardDescription>
      </CardHeader>
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
