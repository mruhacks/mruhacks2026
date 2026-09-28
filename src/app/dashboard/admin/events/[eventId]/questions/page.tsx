import * as React from 'react';
import { redirect } from 'next/navigation';

import { getEventWithQuestions } from '@/app/dashboard/admin/events/actions';
import { QuestionBuilder } from '@/components/question-builder';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

type QuestionsPageProps = {
  params: Promise<{ eventId: string }>;
};

/**
 * Sync shell: the session read and the question load sit behind Suspense so
 * this segment still contributes a static shell, the same way every other
 * page under the event dashboard does. `instant = false` here would opt the
 * whole route out of prefetching.
 */
export default function QuestionsPage({ params }: QuestionsPageProps) {
  return (
    <div className='space-y-4'>
      <div>
        <h2 className='text-lg font-semibold'>Application questions</h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          Add, edit, and reorder questions for this event&apos;s application
          form.
        </p>
      </div>
      <React.Suspense
        fallback={<div className='bg-muted h-96 animate-pulse rounded-xl' />}
      >
        <QuestionsContent paramsPromise={params} />
      </React.Suspense>
    </div>
  );
}

async function QuestionsContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId } = await paramsPromise;
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'event:manage');

  const result = await getEventWithQuestions(eventId);
  if (!result.success || !result.data) {
    return (
      <div className='text-destructive'>
        {!result.success ? result.error : 'Event not found'}
      </div>
    );
  }

  const { questions, hasApplications } = result.data;

  return (
    <QuestionBuilder
      eventId={eventId}
      initialQuestions={questions}
      hasApplications={hasApplications}
    />
  );
}
