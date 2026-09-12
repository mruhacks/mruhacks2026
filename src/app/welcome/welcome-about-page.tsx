'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { SingleValue } from 'react-select';

import {
  welcomeAboutSchema,
  type ProfileFormOptions,
} from '@/components/profile-form/schema';
import { isOtherOption } from '@/lib/other-option';
import {
  saveAboutProfile,
  uploadResume,
  type AboutProfileValues,
} from '@/app/dashboard/profile/actions';
import { completeWelcomeOnboarding } from '@/app/dashboard/account/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
import { Select } from '@/components/select';
import { ProfileAssets } from '@/app/dashboard/profile/profile-assets';
import { markCurrentWelcomeStepReviewable } from './welcome-navigation';

type WelcomeAboutValues = AboutProfileValues;

export function WelcomeAboutPage({
  initial,
  options,
  hasResume,
  resumeFileName,
  backHref,
  nextHref,
  isFinalStep,
}: {
  initial?: Partial<AboutProfileValues>;
  options: ProfileFormOptions;
  hasResume: boolean;
  resumeFileName: string | null;
  backHref: string;
  nextHref: string;
  isFinalStep: boolean;
}) {
  const router = useRouter();
  const [saveError, setSaveError] = React.useState<string>();
  const form = useForm<WelcomeAboutValues>({
    resolver: zodResolver(welcomeAboutSchema) as Resolver<WelcomeAboutValues>,
    defaultValues: {
      universityId: initial?.universityId,
      universityOtherText: initial?.universityOtherText ?? '',
      majorId: initial?.majorId,
      majorOtherText: initial?.majorOtherText ?? '',
      yearOfStudyId: initial?.yearOfStudyId,
      linkedinUrl: initial?.linkedinUrl ?? '',
      githubUrl: initial?.githubUrl ?? '',
      attendedHackathonBefore: initial?.attendedHackathonBefore ?? false,
    },
  });
  const [queuedResume, setQueuedResume] = React.useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = React.useState(false);

  React.useEffect(() => {
    router.prefetch(nextHref);
    router.prefetch(backHref);
  }, [router, nextHref, backHref]);

  // The resume can only be attached once the profile row exists, so it's
  // queued client-side on selection and uploaded here, right after the
  // profile save succeeds — one "Continue" click handles both.
  const submit = async (data: WelcomeAboutValues) => {
    setSaveError(undefined);
    const saveResult = await saveAboutProfile(data);
    if (!saveResult.success) {
      setSaveError(saveResult.error);
      return;
    }

    if (queuedResume) {
      setUploadingResume(true);
      const formData = new FormData();
      formData.set('resume', queuedResume);
      const uploadResult = await uploadResume(formData);
      setUploadingResume(false);
      if (!uploadResult.success) {
        setSaveError(uploadResult.error ?? 'Failed to upload resume.');
        return;
      }
      setQueuedResume(null);
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

  const busy = form.formState.isSubmitting || uploadingResume;

  return (
    <form onSubmit={form.handleSubmit(submit)} className='flex flex-col gap-6'>
      <div>
        <h2 className='text-lg font-semibold'>More about yourself</h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          This helps us shape programming and support for the community.
        </p>
      </div>

      <ProfileAssets
        hasResume={hasResume}
        resumeFileName={resumeFileName}
        queuedResume={queuedResume}
        onQueueResume={setQueuedResume}
        disabled={busy}
      />

      <FieldGroup>
        <Controller
          name='universityId'
          control={form.control}
          render={({ field, fieldState }) => {
            const selected = options.universities.find(
              (option) => option.value === field.value,
            );
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>
                  University / Institution
                  <RequiredAsterisk />
                </FieldLabel>
                <Select
                  id='universityId'
                  instanceId='welcome-university'
                  options={options.universities}
                  aria-invalid={fieldState.invalid}
                  value={selected ?? null}
                  onChange={(option) =>
                    field.onChange(
                      (option as SingleValue<{ value: number; label: string }>)
                        ?.value ?? '',
                    )
                  }
                />
                {fieldState.error && <FieldError errors={[fieldState.error]} />}
                {isOtherOption(selected?.label) && (
                  <Input
                    {...form.register('universityOtherText')}
                    placeholder='Please specify'
                    aria-label='Specify university'
                  />
                )}
              </Field>
            );
          }}
        />
        <Controller
          name='majorId'
          control={form.control}
          render={({ field, fieldState }) => {
            const selected = options.majors.find(
              (option) => option.value === field.value,
            );
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>
                  Major / Program
                  <RequiredAsterisk />
                </FieldLabel>
                <Select
                  id='majorId'
                  instanceId='welcome-major'
                  options={options.majors}
                  aria-invalid={fieldState.invalid}
                  value={selected ?? null}
                  onChange={(option) =>
                    field.onChange(
                      (option as SingleValue<{ value: number; label: string }>)
                        ?.value ?? '',
                    )
                  }
                />
                {fieldState.error && <FieldError errors={[fieldState.error]} />}
                {isOtherOption(selected?.label) && (
                  <Input
                    {...form.register('majorOtherText')}
                    placeholder='Please specify'
                    aria-label='Specify major'
                  />
                )}
              </Field>
            );
          }}
        />
        <Controller
          name='yearOfStudyId'
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>
                Year of Study
                <RequiredAsterisk />
              </FieldLabel>
              <Select
                id='yearOfStudyId'
                instanceId='welcome-year'
                options={options.years}
                aria-invalid={fieldState.invalid}
                value={
                  options.years.find(
                    (option) => option.value === field.value,
                  ) ?? null
                }
                onChange={(option) =>
                  field.onChange(
                    (option as SingleValue<{ value: number; label: string }>)
                      ?.value ?? '',
                  )
                }
              />
              {fieldState.error && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Field data-invalid={Boolean(form.formState.errors.linkedinUrl)}>
          <FieldLabel htmlFor='linkedinUrl'>LinkedIn</FieldLabel>
          <Input
            id='linkedinUrl'
            type='url'
            placeholder='https://linkedin.com/in/janedoe'
            aria-invalid={Boolean(form.formState.errors.linkedinUrl)}
            {...form.register('linkedinUrl')}
          />
          {form.formState.errors.linkedinUrl && (
            <FieldError errors={[form.formState.errors.linkedinUrl]} />
          )}
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.githubUrl)}>
          <FieldLabel htmlFor='githubUrl'>GitHub</FieldLabel>
          <Input
            id='githubUrl'
            type='url'
            placeholder='https://github.com/janedoe'
            aria-invalid={Boolean(form.formState.errors.githubUrl)}
            {...form.register('githubUrl')}
          />
          {form.formState.errors.githubUrl && (
            <FieldError errors={[form.formState.errors.githubUrl]} />
          )}
        </Field>
        <Controller
          name='attendedHackathonBefore'
          control={form.control}
          render={({ field }) => (
            <Field orientation='horizontal'>
              <Checkbox
                id='attendedHackathonBefore'
                checked={field.value}
                onCheckedChange={(value) => field.onChange(value === true)}
              />
              <FieldContent>
                <FieldLabel
                  htmlFor='attendedHackathonBefore'
                  className='font-normal'
                >
                  I have attended a hackathon before.
                </FieldLabel>
              </FieldContent>
            </Field>
          )}
        />
      </FieldGroup>

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
