import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getUser } from '@/utils/auth';
import { getEventWithQuestions } from '@/app/dashboard/admin/events/actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { QuestionBuilder } from '@/components/question-builder';

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function AdminEventQuestionsPage({ params }: Props) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) redirect('/signin');

  const result = await getEventWithQuestions(eventId);

  if (!result.success) notFound();

  const { name, questions, hasApplications, hasApplication } = result.data!;

  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='sm' asChild>
          <Link href='/dashboard/admin/events'>
            <ChevronLeft className='mr-1 size-4' />
            Back
          </Link>
        </Button>
      </div>

      <Card className='w-full sm:max-w-2xl'>
        <CardHeader>
          <CardTitle>Application Questions</CardTitle>
          <CardDescription>
            {name}
            {hasApplications && (
              <span className='text-muted-foreground ml-2 text-xs'>
                · Applications exist — type changes and option removal are
                restricted.
              </span>
            )}
            {!hasApplication && (
              <span className='text-muted-foreground ml-2 text-xs'>
                · This event does not require an application.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuestionBuilder
            eventId={eventId}
            initialQuestions={questions}
            hasApplications={hasApplications}
          />
        </CardContent>
      </Card>
    </div>
  );
}
