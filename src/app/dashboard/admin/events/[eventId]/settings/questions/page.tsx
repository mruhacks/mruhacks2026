import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';

import { getEventWithQuestions } from '@/app/dashboard/admin/events/actions';
import { resolveEventId } from '@/lib/events';
import { QuestionBuilder } from '@/components/question-builder';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

type Props = { params: Promise<{ eventId: string }> };

export default function ApplicationQuestionsPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className='h-96 rounded-xl' />}>
      <ApplicationQuestionsContent params={params} />
    </Suspense>
  );
}

async function ApplicationQuestionsContent({ params }: Props) {
  const { eventId: segment } = await params;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'event:manage');

  const result = await getEventWithQuestions(eventId);

  return (
    <Card className='gap-4 py-5'>
      <CardHeader className='gap-1 px-5'>
        <CardTitle>Application questions</CardTitle>
        <CardDescription>
          Add, edit, or reorder questions. Each change saves separately.
          {result.success &&
            result.data &&
            !result.data.hasApplication &&
            ' Turn on “Require an application” under Registration to show these questions to applicants.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='px-5'>
        {result.success && result.data ? (
          <QuestionBuilder
            key={eventId}
            eventId={eventId}
            initialQuestions={result.data.questions}
            hasApplications={result.data.hasApplications}
          />
        ) : (
          <p role='alert' className='text-destructive text-sm'>
            {!result.success ? result.error : 'Questions could not be loaded.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
