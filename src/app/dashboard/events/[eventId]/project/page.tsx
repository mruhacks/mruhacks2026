import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { getMySubmission } from '@/app/dashboard/events/submission-actions';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import {
  ProjectStageDescription,
  SubmissionView,
} from '@/components/submissions/submission-view';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { serializeInstant } from '@/lib/datetime';
import { resolveEventId } from '@/lib/events';
import { getProjectStage, PROJECT_STAGE_COPY } from '@/lib/submission-copy';
import { getUser } from '@/utils/auth';

import { StartProjectButton } from './start-project-button';
import { SubmissionEditor } from './submission-editor';

type Props = { params: Promise<{ eventId: string }> };

/** Session and DB reads stream in behind Suspense — see the event page. */
export const instant = false;

export default function ProjectPage({ params }: Props) {
  return (
    <Suspense
      fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
    >
      <ProjectContent paramsPromise={params} />
    </Suspense>
  );
}

async function ProjectContent({
  paramsPromise,
}: {
  paramsPromise: Props['params'];
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');

  // Fails for anyone not eligible (or an event without submissions) — a 404
  // rather than "forbidden", the same as a draft wiki article.
  const result = await getMySubmission(eventId);
  if (!result.success || !result.data) notFound();
  const { submissionWindow, opensAt, closesAt, submission } = result.data;

  const eventHref = `/dashboard/events/${segment}`;

  const stage = getProjectStage(submissionWindow, submission);
  const copy = PROJECT_STAGE_COPY[stage];
  // These stages render the editor or the read-only project, each with its
  // own title banner; the rest are a single status card.
  const isEditing = stage === 'private' || stage === 'public';
  const isFinal = stage === 'closed_private' || stage === 'closed_public';

  return (
    <div className='flex flex-col gap-3'>
      <BreadcrumbSegment id='project' label='Project' />
      <Button
        asChild
        variant='ghost'
        size='sm'
        className='text-muted-foreground -ml-2 w-fit'
      >
        <Link href={eventHref}>
          <ArrowLeft data-icon='inline-start' />
          Back to event
        </Link>
      </Button>

      <div className='flex flex-col gap-6'>
        {!isEditing && !isFinal && (
          <>
            <h1 className='text-3xl font-semibold tracking-tight wrap-break-word'>
              Your team&apos;s project
            </h1>
            <Card>
              <CardHeader>
                <CardTitle>{copy.title}</CardTitle>
                <CardDescription>
                  <ProjectStageDescription
                    stage={stage}
                    opensAt={opensAt}
                    closesAt={closesAt}
                  />
                </CardDescription>
              </CardHeader>
              {stage === 'not_started' && (
                <CardFooter>
                  <StartProjectButton eventId={eventId} />
                </CardFooter>
              )}
            </Card>
          </>
        )}

        {isEditing && submission && (
          <SubmissionEditor
            // A new row (after a delete and restart) is a fresh editor.
            key={submission.id}
            eventId={eventId}
            closesAt={serializeInstant(closesAt!)}
            currentUserName={user.name}
            initial={{
              title: submission.title,
              markdown: submission.markdown,
              coverImageUrl: submission.coverImageUrl,
              repoUrl: submission.repoUrl,
              demoUrl: submission.demoUrl,
              videoUrl: submission.videoUrl,
              published: submission.published,
              updatedAt: serializeInstant(submission.updatedAt),
              lastEditedByName: submission.lastEditedByName,
            }}
          />
        )}

        {isFinal && submission && (
          <SubmissionView
            submission={submission}
            notice={
              <>
                {copy.description} {copy.warning}
              </>
            }
          />
        )}
      </div>
    </div>
  );
}
