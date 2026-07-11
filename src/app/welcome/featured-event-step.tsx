'use client';

import * as React from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import ApplicationForm from '@/components/application-form';
import type { ApplicationQuestion } from '@/types/application';
import { Button } from '@/components/ui/button';
import { submitEventApplication } from '@/app/dashboard/events/actions';
import { registerForEvent } from '@/app/register/actions';

export type FeaturedOnboardingEvent = {
  id: string;
  name: string;
  hasApplication: boolean;
  applicationQuestions: ApplicationQuestion[];
  startsAt: Date | null;
};

export function FeaturedEventStep({
  event,
  onComplete,
}: {
  event: FeaturedOnboardingEvent;
  onComplete: () => void;
}) {
  const [registering, setRegistering] = React.useState(false);
  const activeQuestionCount = event.applicationQuestions.filter(
    (question) => question.active && question.type !== 'section_divider',
  ).length;

  const register = async () => {
    setRegistering(true);
    try {
      const result = await registerForEvent(event.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Registered for event.');
      onComplete();
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className='space-y-6'>
      <div className='space-y-1'>
        <h2 className='text-lg font-semibold'>
          {event.hasApplication
            ? `Apply for ${event.name}`
            : `Register for ${event.name}`}
        </h2>
        {event.startsAt && (
          <p className='text-muted-foreground flex items-center gap-1.5 text-sm'>
            <CalendarDays className='size-4' />
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(event.startsAt))}
          </p>
        )}
        <p className='text-muted-foreground text-sm'>
          {event.hasApplication
            ? activeQuestionCount > 0
              ? 'Complete the application questions to join this event.'
              : 'Submit your application for review.'
            : 'Your profile is ready. Register now to save your spot.'}
        </p>
      </div>

      {event.hasApplication ? (
        <ApplicationForm
          eventId={event.id}
          applicationQuestions={event.applicationQuestions}
          submitAction={submitEventApplication}
          submitLabel='Submit application'
          successMessage='Application submitted.'
          onSuccess={onComplete}
        />
      ) : (
        <div className='flex justify-end'>
          <Button onClick={register} disabled={registering}>
            {registering ? (
              <>
                <Loader2 className='mr-2 size-4 animate-spin' /> Registering...
              </>
            ) : (
              'Register'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
