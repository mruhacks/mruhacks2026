'use client';

import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import type {
  ProfileFormOptions,
  ProfileFormValues,
} from '@/components/profile-form/schema';
import { isOtherOption } from '@/lib/other-option';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  RequiredAsterisk,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/select';
import type { MultiValue, SingleValue } from 'react-select';

const otherTextSchema = z
  .string()
  .trim()
  .max(255, 'Keep it under 255 characters.')
  .optional()
  .or(z.literal(''));

const personalSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name.'),
  genderId: z.coerce.number('Choose an option.').int().positive('Choose an option.'),
  genderOtherText: otherTextSchema,
  dietaryRestrictions: z.array(z.number()).default([]),
  dietaryOtherText: otherTextSchema,
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
      genderOtherText: initial?.genderOtherText ?? '',
      dietaryRestrictions: initial?.dietaryRestrictions ?? [],
      dietaryOtherText: initial?.dietaryOtherText ?? '',
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
          <FieldLabel htmlFor='fullName'>
            Name
            <RequiredAsterisk />
          </FieldLabel>
          <Input
            id='fullName'
            placeholder='Jane Doe'
            {...form.register('fullName')}
          />
          {form.formState.errors.fullName && (
            <FieldError errors={[form.formState.errors.fullName]} />
          )}
        </Field>
        <Controller
          name='genderId'
          control={form.control}
          render={({ field, fieldState }) => {
            const selected = options.genders.find(
              (option) => option.value === field.value,
            );
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>
                  Gender
                  <RequiredAsterisk />
                </FieldLabel>
                <Select
                  id='genderId'
                  instanceId='welcome-gender'
                  options={options.genders}
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
                    {...form.register('genderOtherText')}
                    placeholder='Please specify'
                    aria-label='Specify gender'
                  />
                )}
              </Field>
            );
          }}
        />
        <Controller
          name='dietaryRestrictions'
          control={form.control}
          render={({ field }) => {
            const selected = options.dietary.filter((option) =>
              field.value.includes(option.value),
            );
            return (
              <Field>
                <FieldLabel>Dietary Restrictions</FieldLabel>
                <Select
                  id='dietaryRestrictions'
                  instanceId='welcome-dietary'
                  isMulti
                  options={options.dietary}
                  value={selected}
                  onChange={(values) =>
                    field.onChange(
                      (
                        values as MultiValue<{ value: number; label: string }>
                      ).map((option) => option.value),
                    )
                  }
                />
                {selected.some((option) => isOtherOption(option.label)) && (
                  <Input
                    {...form.register('dietaryOtherText')}
                    placeholder='Please specify'
                    aria-label='Specify dietary restriction'
                  />
                )}
              </Field>
            );
          }}
        />
      </FieldGroup>
      <div className='flex justify-end border-t pt-6'>
        <Button type='submit'>Continue</Button>
      </div>
    </form>
  );
}
