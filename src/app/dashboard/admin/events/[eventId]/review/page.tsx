import * as React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { getAdminEventHeader, getEventQuestions } from '@/lib/admin-event';
import { getReviewQueue, reviewQuestions } from '@/lib/application-votes';
import { resolveEventId } from '@/lib/events';
import { hasPermission, requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { ReviewDeck } from './review-deck';

type Props = { params: Promise<{ eventId: string }> };

/** First batch rendered with the page; the deck refills through an action. */
const INITIAL_BATCH = 10;

/**
 * Blind swipe review: one application at a time, only the questions tagged
 * "Show in Application Review", yes or no. See `@/lib/application-votes` for
 * how votes move applicants onto (and up) the waitlist.
 *
 * Sync shell so the segment keeps its static shell; see `questions/page.tsx`.
 */
export default function ReviewPage({ params }: Props) {
  return (
    <React.Suspense
      fallback={
        <div className='bg-muted mx-auto h-112 max-w-xl animate-pulse rounded-xl' />
      }
    >
      <ReviewContent paramsPromise={params} />
    </React.Suspense>
  );
}

async function ReviewContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');

  await requirePermission(user.id, 'application:vote:all');

  const [event, questions, canEditQuestions] = await Promise.all([
    getAdminEventHeader(eventId),
    getEventQuestions(eventId),
    hasPermission(user.id, 'event:manage'),
  ]);
  if (!event) notFound();

  const base = `/dashboard/admin/events/${segment}`;

  if (!event.hasApplication) {
    return (
      <EmptyState title='No applications to review'>
        This event takes registrations without an application.
      </EmptyState>
    );
  }

  if (reviewQuestions(questions).length === 0) {
    return (
      <EmptyState title='No questions tagged for review'>
        Reviewers only see questions with “Show in Application Review” turned
        on, and none are yet.
        {canEditQuestions && (
          <div className='mt-4'>
            <Button asChild variant='outline' size='sm'>
              <Link href={`${base}/settings/questions`}>Edit questions</Link>
            </Button>
          </div>
        )}
      </EmptyState>
    );
  }

  const initial = await getReviewQueue({
    eventId,
    voterId: user.id,
    questions,
    limit: INITIAL_BATCH,
  });

  return (
    <div className='space-y-4'>
      <div>
        <h2 className='text-lg font-semibold'>Review applications</h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          Names are hidden. One yes puts an applicant — and their team, unless
          denied — on the waitlist, which is ranked by each team&apos;s
          best-reviewed member.
        </p>
      </div>
      <ReviewDeck eventId={eventId} initial={initial} />
    </div>
  );
}

function EmptyState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className='mx-auto max-w-xl rounded-xl border border-dashed p-8 text-center'>
      <h2 className='text-lg font-semibold'>{title}</h2>
      <div className='text-muted-foreground mt-2 text-sm'>{children}</div>
    </div>
  );
}
