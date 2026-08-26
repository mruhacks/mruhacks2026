'use client';

import * as React from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { SingleValue } from 'react-select';

import {
  type ProfileFormOptions,
  linkedinUrlSchema,
  githubUrlSchema,
} from '@/components/profile-form/schema';
import { isOtherOption } from '@/lib/other-option';
import type { ActionResult } from '@/utils/action-result';
import { uploadResume } from '@/app/dashboard/profile/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  RequiredAsterisk,
} from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/select';
import { ProfileAssets } from '@/app/dashboard/profile/profile-assets';

const requiredOption = (message: string) =>
  z.coerce.number(message).int().positive(message);

const otherTextSchema = z
  .string()
  .trim()
  .max(255, 'Keep it under 255 characters.')
  .optional()
  .or(z.literal(''));

const aboutSchema = z.object({
  universityId: requiredOption('Choose an institution.'),
  universityOtherText: otherTextSchema,
  majorId: requiredOption('Choose a program.'),
  majorOtherText: otherTextSchema,
  yearOfStudyId: requiredOption('Choose a year.'),
  linkedinUrl: linkedinUrlSchema,
  githubUrl: githubUrlSchema,
  attendedHackathonBefore: z.boolean(),
});

export type AboutOnboardingValues = z.infer<typeof aboutSchema>;

export function WelcomeAboutPage({
  options,
  hasResume,
  resumeFileName,
  onBack,
  onComplete,
  onSaveDraft,
}: {
  options: ProfileFormOptions;
  hasResume: boolean;
  resumeFileName: string | null;
  onBack: () => void;
  /** Called once the profile (and any queued resume) has been saved. */
  onComplete: () => void;
  onSaveDraft: (data: AboutOnboardingValues) => Promise<ActionResult>;
}) {
  const form = useForm<AboutOnboardingValues>({
    resolver: zodResolver(aboutSchema) as Resolver<AboutOnboardingValues>,
    defaultValues: {
      linkedinUrl: '',
      githubUrl: '',
      attendedHackathonBefore: false,
    },
  });
  const [queuedResume, setQueuedResume] = React.useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = React.useState(false);

  // The resume can only be attached once the profile row exists, so it's
  // queued client-side on selection and uploaded here, right after the
  // profile save succeeds — one "Continue" click handles both.
  const submit = async (data: AboutOnboardingValues) => {
    const saveResult = await onSaveDraft(data);
    if (!saveResult.success) {
      toast.error(saveResult.error);
      return;
    }

    if (queuedResume) {
      setUploadingResume(true);
      const formData = new FormData();
      formData.set('resume', queuedResume);
      const uploadResult = await uploadResume(formData);
      setUploadingResume(false);
      if (!uploadResult.success) {
        toast.error(uploadResult.error ?? 'Failed to upload resume.');
        return;
      }
      setQueuedResume(null);
    }

    toast.success('Profile saved.');
    onComplete();
  };

  const busy = form.formState.isSubmitting || uploadingResume;

  return (
    <form onSubmit={form.handleSubmit(submit)} className='space-y-6'>
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
                  value={selected ?? null}
                  onChange={(option) =>
                    field.onChange(
                      (
                        option as SingleValue<{ value: number; label: string }>
                      )?.value ?? '',
                    )
                  }
                />
                {fieldState.error && (
                  <FieldError errors={[fieldState.error]} />
                )}
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
                  value={selected ?? null}
                  onChange={(option) =>
                    field.onChange(
                      (
                        option as SingleValue<{ value: number; label: string }>
                      )?.value ?? '',
                    )
                  }
                />
                {fieldState.error && (
                  <FieldError errors={[fieldState.error]} />
                )}
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
            <Field>
              <div className='flex items-start gap-3'>
                <Checkbox
                  id='attendedHackathonBefore'
                  checked={field.value}
                  onCheckedChange={(value) => field.onChange(value === true)}
                  className='mt-0.5'
                />
                <Label
                  htmlFor='attendedHackathonBefore'
                  className='text-sm leading-snug font-normal'
                >
                  I have attended a hackathon before.
                </Label>
              </div>
            </Field>
          )}
        />
      </FieldGroup>

      <div className='flex justify-between gap-3'>
        <Button type='button' variant='outline' onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type='submit' disabled={busy}>
          {busy ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' /> Saving...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </form>
  );
}
