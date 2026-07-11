'use client';

import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { MultiValue, SingleValue } from 'react-select';

import type { ProfileFormOptions } from '@/components/profile-form/schema';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/select';

const aboutSchema = z.object({
  universityId: z.coerce.number().int().positive('Choose an institution.'),
  majorId: z.coerce.number().int().positive('Choose a program.'),
  yearOfStudyId: z.coerce.number().int().positive('Choose a year.'),
  interests: z.array(z.number()).min(1, 'Choose at least one interest.'),
  attendedHackathonBefore: z.boolean(),
});

export type AboutOnboardingValues = z.infer<typeof aboutSchema>;

export function WelcomeAboutPage({
  options,
  onBack,
  onComplete,
}: {
  options: ProfileFormOptions;
  onBack: () => void;
  onComplete: (data: AboutOnboardingValues) => Promise<void>;
}) {
  const form = useForm<AboutOnboardingValues>({
    resolver: zodResolver(aboutSchema) as Resolver<AboutOnboardingValues>,
    defaultValues: { interests: [], attendedHackathonBefore: false },
  });

  return (
    <form onSubmit={form.handleSubmit(onComplete)} className='space-y-6'>
      <div>
        <h2 className='text-lg font-semibold'>More about yourself</h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          This helps us shape programming and support for the community.
        </p>
      </div>
      <FieldGroup>
        <Controller
          name='universityId'
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>University / Institution</FieldLabel>
              <Select
                id='universityId'
                instanceId='welcome-university'
                options={options.universities}
                value={
                  options.universities.find(
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
        <Controller
          name='majorId'
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Major / Program</FieldLabel>
              <Select
                id='majorId'
                instanceId='welcome-major'
                options={options.majors}
                value={
                  options.majors.find(
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
        <Controller
          name='yearOfStudyId'
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Year of Study</FieldLabel>
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
        <Controller
          name='interests'
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Interests</FieldLabel>
              <Select
                id='interests'
                instanceId='welcome-interests'
                isMulti
                options={options.interests}
                value={options.interests.filter((option) =>
                  field.value.includes(option.value),
                )}
                onChange={(values) =>
                  field.onChange(
                    (
                      values as MultiValue<{ value: number; label: string }>
                    ).map((option) => option.value),
                  )
                }
              />
              {fieldState.error && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
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
      <div className='flex justify-between gap-3 border-t pt-6'>
        <Button type='button' variant='outline' onClick={onBack}>
          Back
        </Button>
        <Button type='submit' disabled={form.formState.isSubmitting}>
          Continue
        </Button>
      </div>
    </form>
  );
}
