'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';

import ApplicationForm from '@/components/application-form';
import type { ApplicationQuestion } from '@/types/application';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '@/components/ui/field';
import { submitEventApplication } from '@/app/dashboard/events/actions';
import { joinTeamByCode } from '@/app/dashboard/events/team-actions';
import { registerForEvent } from '@/app/register/actions';
import { completeWelcomeOnboarding } from '@/app/dashboard/account/actions';
import { Spinner } from '@/components/ui/spinner';

export type FeaturedOnboardingEvent = {
  id: string;
  name: string;
  hasApplication: boolean;
  applicationQuestions: ApplicationQuestion[];
  startsAt: Date | null;
  teamsEnabled: boolean;
};

export function FeaturedEventStep({
  event,
  backHref,
  nextHref,
  isFinalStep,
}: {
  event: FeaturedOnboardingEvent;
  backHref: string;
  nextHref: string;
  isFinalStep: boolean;
}) {
  const router = useRouter();
  const [registering, setRegistering] = React.useState(false);
  const [teamCode, setTeamCode] = React.useState('');
  const [teamCodeError, setTeamCodeError] = React.useState<string | null>(null);
  const [advanceError, setAdvanceError] = React.useState<string | null>(null);
  const activeQuestionCount = event.applicationQuestions.filter(
    (question) => question.active && question.type !== 'section_divider',
  ).length;

  React.useEffect(() => {
    router.prefetch(nextHref);
    router.prefetch(backHref);
  }, [router, nextHref, backHref]);

  const advance = async () => {
    setAdvanceError(null);
    if (isFinalStep) {
      const result = await completeWelcomeOnboarding();
      if (!result.success) {
        setAdvanceError(result.error ?? 'Unable to finish setup.');
        return;
      }
    }
    router.push(nextHref);
  };

  /**
   * Runs once the application/registration itself has already succeeded. A
   * team code can only be redeemed after the caller has a live
   * registration/application row (see isEventParticipant in
   * team-actions.ts), so joining is a follow-up call rather than part of
   * that submit. A bad code blocks moving to the next step (so the user can
   * fix or clear it) but never touches the application, which is already
   * saved.
   */
  const joinTeamIfProvided = async (): Promise<boolean> => {
    const trimmed = teamCode.trim();
    if (!trimmed) return true;
    const result = await joinTeamByCode(event.id, trimmed);
    if (!result.success) {
      setTeamCodeError(result.error ?? 'Unable to join that team.');
      return false;
    }
    toast.success('Joined team.');
    return true;
  };

  const register = async () => {
    setRegistering(true);
    try {
      const result = await registerForEvent(event.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Registered for event.');
      if (await joinTeamIfProvided()) await advance();
    } finally {
      setRegistering(false);
    }
  };

  const onApplicationSuccess = async () => {
    if (await joinTeamIfProvided()) await advance();
  };

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-1'>
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

      {event.teamsEnabled && (
        <Field data-invalid={teamCodeError != null}>
          <FieldLabel htmlFor='welcome-team-code'>
            Team code (optional)
          </FieldLabel>
          <FieldDescription>
            Have a code from a teammate? Enter it to join their team when you
            submit below — you can also do this later from the event page.
          </FieldDescription>
          <Input
            id='welcome-team-code'
            aria-invalid={teamCodeError != null}
            value={teamCode}
            onChange={(e) => {
              setTeamCode(e.target.value);
              if (teamCodeError) setTeamCodeError(null);
            }}
            placeholder='e.g. AB12CD34'
            autoCapitalize='characters'
          />
          {teamCodeError && <FieldError>{teamCodeError}</FieldError>}
        </Field>
      )}

      {event.hasApplication ? (
        <ApplicationForm
          eventId={event.id}
          applicationQuestions={event.applicationQuestions}
          submitAction={submitEventApplication}
          submitLabel='Submit application'
          successMessage='Application submitted.'
          onSuccess={onApplicationSuccess}
        />
      ) : (
        <div className='flex items-center justify-between gap-3'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.push(backHref)}
            disabled={registering}
          >
            Back
          </Button>
          <Button onClick={register} disabled={registering}>
            {registering ? (
              <>
                <Spinner data-icon='inline-start' /> Registering...
              </>
            ) : (
              'Register'
            )}
          </Button>
        </div>
      )}
      {event.hasApplication && (
        <Button
          type='button'
          variant='outline'
          className='self-start'
          onClick={() => router.push(backHref)}
        >
          Back
        </Button>
      )}
      {advanceError && <FieldError>{advanceError}</FieldError>}
    </div>
  );
}
