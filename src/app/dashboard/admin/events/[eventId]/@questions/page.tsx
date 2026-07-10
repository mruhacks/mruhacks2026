import { redirect } from 'next/navigation';
import { getUser } from '@/utils/auth';
import { requirePermission } from '@/lib/rbac/authorization';
import { getEventWithQuestions } from '@/app/dashboard/admin/events/actions';
import { QuestionBuilder } from '@/components/question-builder';

type QuestionsPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function QuestionsPage({ params }: QuestionsPageProps) {
  const { eventId } = await params;
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
    <div className='space-y-4'>
      <div>
        <h2 className='text-lg font-semibold'>Application Questions</h2>
        <p className='text-muted-foreground text-sm mt-1'>
          Add, edit, and reorder questions for this event&apos;s application form.
        </p>
      </div>
      <QuestionBuilder
        eventId={eventId}
        initialQuestions={questions}
        hasApplications={hasApplications}
      />
    </div>
  );
}
