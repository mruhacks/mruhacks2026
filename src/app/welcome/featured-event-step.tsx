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
import { LocalDateTime } from '@/components/local-date-time';
import { completeWelcomeOnboarding } from '@/app/dashboard/account/actions';
import { Spinner } from '@/components/ui/spinner';
import { intakeCopy } from '@/lib/intake';
import type { EventOnlyFormValues } from '@/components/application-form/schema';

export type FeaturedOnboardingEvent = {
  id: string;
  name: string;
  hasApplication: boolean;
  applicationQuestions: ApplicationQuestion[];
  startsAt: Date | null;
  teamsEnabled: boolean;
  /** Shown as a deadline; the step is skipped entirely once it passes. */
  applicationsCloseAt: Date | null;
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
  const [registerError, setRegisterError] = React.useState<string | null>(null);
  // The wizard drops this step once intake closes, but a page loaded just
  // before that can still be open. When the server turns the submit away for
  // that reason, the only thing left to do here is move on.
  const [intakeClosed, setIntakeClosed] = React.useState(false);
  const copy = intakeCopy(event.hasApplication);
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
      setRegisterError(null);
      const result = await registerForEvent(event.id);
      if (!result.success) {
        if (result.error === copy.closedMessage) setIntakeClosed(true);
        else setRegisterError(result.error);
        return;
      }
      toast.success('Registered for event.');
      if (await joinTeamIfProvided()) await advance();
    } finally {
      setRegistering(false);
    }
  };

  const submitApplication = async (
    data: EventOnlyFormValues,
    eventId: string,
  ) => {
    const result = await submitEventApplication(data, eventId);
    if (!result.success && result.error === copy.closedMessage) {
      setIntakeClosed(true);
    }
    return result;
  };

  const onApplicationSuccess = async () => {
    if (await joinTeamIfProvided()) await advance();
  };

  if (intakeClosed) {
    return (
      <div className='flex flex-col gap-6'>
        <div className='flex flex-col gap-1'>
          <h2 className='text-lg font-semibold'>{event.name}</h2>
          <p className='text-muted-foreground text-sm'>
            {copy.closedMessage} You can finish setting up your account without
            it.
          </p>
        </div>
        <div className='flex items-center justify-between gap-3'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.push(backHref)}
          >
            Back
          </Button>
          <Button type='button' onClick={advance}>
            Continue
          </Button>
        </div>
        {advanceError && <FieldError>{advanceError}</FieldError>}
      </div>
    );
  }

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
            <LocalDateTime
              value={event.startsAt}
              dateStyle='medium'
              timeStyle='short'
            />
          </p>
        )}
        {event.applicationsCloseAt && (
          <p className='text-muted-foreground text-sm'>
            {copy.closesLabel}{' '}
            <LocalDateTime
              value={event.applicationsCloseAt}
              dateStyle='medium'
              timeStyle='short'
            />
            .
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
          submitAction={submitApplication}
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
      {registerError && <FieldError>{registerError}</FieldError>}
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
