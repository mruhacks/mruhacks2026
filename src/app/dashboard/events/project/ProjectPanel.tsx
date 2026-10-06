import Link from 'next/link';

import { getMySubmission } from '@/app/dashboard/events/submission-actions';
import {
  ProjectStageDescription,
  ProjectStageWarning,
  SubmissionStatusBadge,
} from '@/components/submissions/submission-view';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getProjectStage, PROJECT_STAGE_COPY } from '@/lib/submission-copy';

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
  const { submissionWindow, opensAt, closesAt, submission } = result.data;
  const stage = getProjectStage(submissionWindow, submission);
  const { action } = PROJECT_STAGE_COPY[stage];

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
        <ProjectStageWarning stage={stage} />
        <CardDescription>
          <ProjectStageDescription
            stage={stage}
            opensAt={opensAt}
            closesAt={closesAt}
          />
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
