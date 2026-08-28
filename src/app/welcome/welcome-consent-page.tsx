'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import {
  recordOnboardingConsent,
  completeWelcomeOnboarding,
} from '@/app/dashboard/account/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  RequiredAsterisk,
} from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import curtWaving from '@/assets/crt_waving.png';
import { markCurrentWelcomeStepReviewable } from './welcome-navigation';

export function WelcomeConsentPage({
  nextHref,
  isFinalStep,
  initialAcceptLegal = false,
  initialMarketing = false,
}: {
  nextHref: string;
  isFinalStep: boolean;
  initialAcceptLegal?: boolean;
  initialMarketing?: boolean;
}) {
  const router = useRouter();
  const [acceptLegal, setAcceptLegal] = React.useState(initialAcceptLegal);
  const [marketing, setMarketing] = React.useState(initialMarketing);
  const [legalError, setLegalError] = React.useState<string>();
  const [saveError, setSaveError] = React.useState<string>();
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    router.prefetch(nextHref);
  }, [router, nextHref]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(undefined);
    if (!acceptLegal) {
      setLegalError('You must accept the Terms of Use and Privacy Policy.');
      return;
    }

    setSubmitting(true);
    const result = await recordOnboardingConsent(marketing);
    if (!result.success) {
      setSubmitting(false);
      setSaveError(result.error);
      return;
    }
    if (isFinalStep) {
      const finishResult = await completeWelcomeOnboarding();
      setSubmitting(false);
      if (!finishResult.success) {
        setSaveError(finishResult.error ?? 'Unable to finish setup.');
        return;
      }
    } else {
      setSubmitting(false);
      markCurrentWelcomeStepReviewable();
    }
    router.push(nextHref);
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className='flex flex-col gap-6'>
        <div>
          <Image
            src={curtWaving}
            alt='Curt waving'
            className='mx-auto mb-5 h-auto w-40'
            priority
          />
          <h2 className='text-lg font-semibold'>Welcome to MRUHacks!</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            First, some legal stuff.
          </p>
        </div>
        <FieldGroup className='gap-3'>
          <Field
            orientation='horizontal'
            data-invalid={Boolean(legalError)}
            data-disabled={submitting}
          >
            <Checkbox
              id='welcome-legal'
              checked={acceptLegal}
              onCheckedChange={(value) => {
                setAcceptLegal(value === true);
                setLegalError(undefined);
              }}
              disabled={submitting}
              aria-invalid={Boolean(legalError)}
              required
            />
            <FieldContent className='min-w-0'>
              <FieldLabel
                htmlFor='welcome-legal'
                className='block w-full font-normal'
              >
                I agree to the{' '}
                <Link
                  href='/terms'
                  className='text-primary whitespace-nowrap underline underline-offset-2'
                >
                  Terms of Use
                </Link>{' '}
                and{' '}
                <Link
                  href='/privacy'
                  className='text-primary whitespace-nowrap underline underline-offset-2'
                >
                  Privacy Policy
                </Link>
                <RequiredAsterisk />
              </FieldLabel>
              {legalError && <FieldError>{legalError}</FieldError>}
            </FieldContent>
          </Field>
          <Field orientation='horizontal' data-disabled={submitting}>
            <Checkbox
              id='welcome-marketing'
              checked={marketing}
              onCheckedChange={(value) => setMarketing(value === true)}
              disabled={submitting}
            />
            <FieldLabel htmlFor='welcome-marketing' className='font-normal'>
              Send me newsletters, sponsor offers, and updates about future
              MRUHacks events.
            </FieldLabel>
          </Field>
        </FieldGroup>
      </div>
      <Separator className='mt-8 mb-6' />
      <div className='flex flex-col gap-2'>
        <Button type='submit' disabled={submitting} className='w-full'>
          {submitting ? (
            <>
              <Spinner data-icon='inline-start' /> Saving...
            </>
          ) : (
            'Continue'
          )}
        </Button>
        {saveError && <FieldError>{saveError}</FieldError>}
      </div>
    </form>
  );
}
