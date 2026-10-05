import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { getMySubmission } from '@/app/dashboard/events/submission-actions';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { LocalDateTime } from '@/components/local-date-time';
import { SubmissionView } from '@/components/submissions/submission-view';
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
  const { window, opensAt, closesAt, submission } = result.data;

  const eventHref = `/dashboard/events/${segment}`;

  return (
    <div className='flex flex-col gap-6'>
      <BreadcrumbSegment id='project' label='Project' />
      <header className='flex flex-col gap-3'>
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
        <h1 className='text-3xl font-semibold tracking-tight'>
          Your team&apos;s project
        </h1>
      </header>

      {window === 'not_open' && (
        <Card>
          <CardHeader>
            <CardTitle>Submissions aren&apos;t open yet</CardTitle>
            <CardDescription>
              You can start your write-up once the event begins, at{' '}
              <LocalDateTime
                value={opensAt}
                dateStyle='medium'
                timeStyle='short'
                timeZoneName='short'
              />
              .
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {window === 'open' && !submission && (
        <Card>
          <CardHeader>
            <CardTitle>Start your project</CardTitle>
            <CardDescription>
              One write-up per team, shared by every teammate. Submissions close{' '}
              <LocalDateTime
                value={closesAt}
                dateStyle='medium'
                timeStyle='short'
                timeZoneName='short'
              />
              .
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <StartProjectButton eventId={eventId} />
          </CardFooter>
        </Card>
      )}

      {window === 'open' && submission && (
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

      {window === 'closed' &&
        (submission ? (
          <Card className='p-6'>
            <p className='text-muted-foreground text-sm'>
              The submission deadline has passed — this is final.
              {!submission.published &&
                " It was still a draft at the deadline, so it won't be judged."}
            </p>
            <SubmissionView submission={submission} />
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Submissions are closed</CardTitle>
              <CardDescription>
                Your team didn&apos;t submit a project before the deadline.
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
    </div>
  );
}
