import { redirect, notFound } from 'next/navigation';

import { getUser } from '@/utils/auth';
import FormBuilder from '@/components/form-builder';
import { getFormBuilderData } from './actions';

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function FormBuilderPage({ params }: Props) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) redirect('/signin');

  const result = await getFormBuilderData(eventId);
  if (!result.success || !result.data) notFound();

  const { event, questions, hasApplications } = result.data;

  return (
    <div className='w-full max-w-3xl'>
      <FormBuilder
        eventId={event.id}
        eventName={event.name}
        initialQuestions={questions}
        hasApplications={hasApplications}
      />
    </div>
  );
}
