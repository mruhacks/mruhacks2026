'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { professionalSchema } from '@/components/profile-form/schema';
import {
  saveProfessionalProfile,
  type ProfessionalProfileValues,
} from '@/app/dashboard/profile/actions';
import { completeWelcomeOnboarding } from '@/app/dashboard/account/actions';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { ProfessionalFields } from '@/components/profile-form/professional-fields';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { markCurrentWelcomeStepReviewable } from './welcome-navigation';

/** The judge's onboarding step, in place of About: who they are at work. */
export function WelcomeProfessionalPage({
  initial,
  backHref,
  nextHref,
  isFinalStep,
}: {
  initial?: Partial<ProfessionalProfileValues>;
  backHref: string;
  nextHref: string;
  isFinalStep: boolean;
}) {
  const router = useRouter();
  const [saveError, setSaveError] = React.useState<string>();
  const form = useForm<ProfessionalProfileValues>({
    resolver: zodResolver(
      professionalSchema,
    ) as unknown as Resolver<ProfessionalProfileValues>,
    defaultValues: {
      company: initial?.company ?? '',
      jobTitle: initial?.jobTitle ?? '',
    },
  });

  React.useEffect(() => {
    router.prefetch(nextHref);
    router.prefetch(backHref);
  }, [router, nextHref, backHref]);

  const submit = async (data: ProfessionalProfileValues) => {
    setSaveError(undefined);
    const saveResult = await saveProfessionalProfile(data);
    if (!saveResult.success) {
      setSaveError(saveResult.error);
      return;
    }

    if (isFinalStep) {
      const finishResult = await completeWelcomeOnboarding();
      if (!finishResult.success) {
        setSaveError(finishResult.error ?? 'Unable to finish setup.');
        return;
      }
    } else {
      markCurrentWelcomeStepReviewable();
    }

    router.push(nextHref);
  };

  const busy = form.formState.isSubmitting;

  return (
    <form
      onSubmit={form.handleSubmit(submit)}
      onChange={() => setSaveError(undefined)}
      className='flex flex-col gap-6'
    >
      <div>
        <h2 className='text-lg font-semibold'>Your work</h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          Organizers use this to introduce judges to the teams they meet.
        </p>
      </div>

      <ProfessionalFields form={form} />

      <Separator />
      <div className='flex flex-col gap-2'>
        <div className='flex items-center justify-between gap-3'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.push(backHref)}
            disabled={busy}
          >
            Back
          </Button>
          <Button type='submit' disabled={busy}>
            {busy ? (
              <>
                <Spinner data-icon='inline-start' /> Saving...
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </div>
        {saveError && <FieldError>{saveError}</FieldError>}
      </div>
    </form>
  );
}
