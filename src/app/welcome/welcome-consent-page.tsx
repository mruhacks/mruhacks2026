'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { recordOnboardingConsent } from '@/app/dashboard/account/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import curtWaving from '@/assets/crt_waving.png';

export function WelcomeConsentPage({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack?: () => void;
}) {
  const [acceptLegal, setAcceptLegal] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);
  const [legalError, setLegalError] = React.useState<string>();
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!acceptLegal) {
      setLegalError('You must accept the Terms of Use and Privacy Policy.');
      return;
    }

    setSubmitting(true);
    const result = await recordOnboardingConsent(marketing);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onComplete();
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className='space-y-6'>
        <div>
          <Image
            src={curtWaving}
            alt='Curt waving'
            className='mb-5 h-auto w-40'
            priority
          />
          <h2 className='text-lg font-semibold'>Welcome to MRUHacks!</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            First, some legal stuff.
          </p>
        </div>
        <FieldGroup>
          <Field data-invalid={Boolean(legalError)}>
            <div className='flex items-start gap-3'>
              <Checkbox
                id='welcome-legal'
                checked={acceptLegal}
                onCheckedChange={(value) => {
                  setAcceptLegal(value === true);
                  setLegalError(undefined);
                }}
                disabled={submitting}
                className='mt-0.5'
              />
              <Label
                htmlFor='welcome-legal'
                className='text-sm leading-snug font-normal'
              >
                I agree to the{' '}
                <Link
                  href='/terms'
                  target='_blank'
                  className='text-primary underline underline-offset-2'
                >
                  Terms of Use
                </Link>{' '}
                and{' '}
                <Link
                  href='/privacy'
                  target='_blank'
                  className='text-primary underline underline-offset-2'
                >
                  Privacy Policy
                </Link>
                .
              </Label>
            </div>
            {legalError && <FieldError>{legalError}</FieldError>}
          </Field>
          <Field>
            <div className='flex items-start gap-3'>
              <Checkbox
                id='welcome-marketing'
                checked={marketing}
                onCheckedChange={(value) => setMarketing(value === true)}
                disabled={submitting}
                className='mt-0.5'
              />
              <Label
                htmlFor='welcome-marketing'
                className='text-muted-foreground text-sm leading-snug font-normal'
              >
                Send me newsletters, sponsor offers, and updates about future
                MRUHacks events.
              </Label>
            </div>
          </Field>
        </FieldGroup>
      </div>
      <div className='mt-8 flex gap-3 border-t pt-6'>
        {onBack && (
          <Button
            type='button'
            variant='outline'
            onClick={onBack}
            disabled={submitting}
          >
            Back
          </Button>
        )}
        <Button type='submit' disabled={submitting} className='flex-1'>
          {submitting ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' /> Saving...
            </>
          ) : (
            'Finish setup'
          )}
        </Button>
      </div>
    </form>
  );
}
