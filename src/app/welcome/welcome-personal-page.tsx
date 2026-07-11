'use client';

import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import type {
  ProfileFormOptions,
  ProfileFormValues,
} from '@/components/profile-form/schema';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/select';
import type { MultiValue, SingleValue } from 'react-select';

const personalSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name.'),
  genderId: z.coerce.number().int().positive('Choose an option.'),
  dietaryRestrictions: z.array(z.number()).default([]),
});

export type PersonalOnboardingValues = z.infer<typeof personalSchema>;

export function WelcomePersonalPage({
  initial,
  options,
  onComplete,
}: {
  initial?: Partial<ProfileFormValues>;
  options: ProfileFormOptions;
  onComplete: (data: PersonalOnboardingValues) => void;
}) {
  const form = useForm<PersonalOnboardingValues>({
    resolver: zodResolver(personalSchema) as Resolver<PersonalOnboardingValues>,
    defaultValues: {
      fullName: initial?.fullName ?? '',
      genderId: initial?.genderId,
      dietaryRestrictions: initial?.dietaryRestrictions ?? [],
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onComplete)} className='space-y-6'>
      <div>
        <h2 className='text-lg font-semibold'>
          Complete your personal information
        </h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          Start with the basics so we can personalize your event experience.
        </p>
      </div>
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.fullName)}>
          <FieldLabel htmlFor='fullName'>Name</FieldLabel>
          <Input id='fullName' {...form.register('fullName')} />
          {form.formState.errors.fullName && (
            <FieldError errors={[form.formState.errors.fullName]} />
          )}
        </Field>
        <Controller
          name='genderId'
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Gender</FieldLabel>
              <Select
                id='genderId'
                instanceId='welcome-gender'
                options={options.genders}
                value={
                  options.genders.find(
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
          name='dietaryRestrictions'
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel>Dietary Restrictions</FieldLabel>
              <Select
                id='dietaryRestrictions'
                instanceId='welcome-dietary'
                isMulti
                options={options.dietary}
                value={options.dietary.filter((option) =>
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
            </Field>
          )}
        />
      </FieldGroup>
      <div className='flex justify-end border-t pt-6'>
        <Button type='submit'>Continue</Button>
      </div>
    </form>
  );
}
