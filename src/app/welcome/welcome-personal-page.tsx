'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  personalSchema,
  type ProfileFormOptions,
  type ProfileFormValues,
} from '@/components/profile-form/schema';
import type { PersonalProfileValues } from '@/app/dashboard/profile/actions';
import { savePersonalProfile } from '@/app/dashboard/profile/actions';
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
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Select } from '@/components/select';
import type { MultiValue, SingleValue } from 'react-select';
import { markCurrentWelcomeStepReviewable } from './welcome-navigation';

export function WelcomePersonalPage({
  initial,
  options,
  backHref,
  nextHref,
}: {
  initial?: Partial<ProfileFormValues>;
  options: ProfileFormOptions;
  backHref: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [saveError, setSaveError] = React.useState<string>();
  const form = useForm<PersonalProfileValues>({
    resolver: zodResolver(personalSchema) as Resolver<PersonalProfileValues>,
    defaultValues: {
      fullName: initial?.fullName ?? '',
      genderId: initial?.genderId,
      genderOtherText: initial?.genderOtherText ?? '',
      dietaryRestrictions: initial?.dietaryRestrictions ?? [],
      dietaryOtherText: initial?.dietaryOtherText ?? '',
    },
  });
  const [dietaryNoneSelected, setDietaryNoneSelected] = React.useState(false);

  React.useEffect(() => {
    router.prefetch(nextHref);
    router.prefetch(backHref);
  }, [router, nextHref, backHref]);

  const submit = async (data: PersonalProfileValues) => {
    setSaveError(undefined);
    const result = await savePersonalProfile(data);
    if (!result.success) {
      setSaveError(result.error);
      return;
    }
    markCurrentWelcomeStepReviewable();
    router.push(nextHref);
  };

  return (
    <form onSubmit={form.handleSubmit(submit)} className='flex flex-col gap-6'>
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
            aria-invalid={Boolean(form.formState.errors.fullName)}
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
          render={({ field, fieldState }) => {
            const NONE_OPTION = { value: 0, label: 'None' };
            const dietaryOptions = [NONE_OPTION, ...options.dietary];
            const selected = dietaryNoneSelected
              ? [NONE_OPTION]
              : options.dietary.filter((option) =>
                  field.value.includes(option.value),
                );
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Dietary Restrictions</FieldLabel>
                <Select
                  id='dietaryRestrictions'
                  instanceId='welcome-dietary'
                  isMulti
                  options={dietaryOptions}
                  aria-invalid={fieldState.invalid}
                  value={selected}
                  onChange={(values) => {
                    const vals = (
                      values as MultiValue<{ value: number; label: string }>
                    ).map((o) => o.value);
                    const hasNone = vals.includes(0);
                    if (hasNone && !dietaryNoneSelected) {
                      setDietaryNoneSelected(true);
                      field.onChange([]);
                    } else if (hasNone && dietaryNoneSelected) {
                      setDietaryNoneSelected(false);
                      field.onChange(vals.filter((v) => v !== 0));
                    } else {
                      setDietaryNoneSelected(false);
                      field.onChange(vals);
                    }
                  }}
                />
                {selected.some((option) => isOtherOption(option.label)) && (
                  <Input
                    {...form.register('dietaryOtherText')}
                    placeholder='Please specify'
                    aria-label='Specify dietary restriction'
                  />
                )}
                {fieldState.error && <FieldError errors={[fieldState.error]} />}
              </Field>
            );
          }}
        />
      </FieldGroup>
      <Separator />
      <div className='flex flex-col gap-2'>
        <div className='flex items-center justify-between gap-3'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.push(backHref)}
            disabled={form.formState.isSubmitting}
          >
            Back
          </Button>
          <Button type='submit' disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
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
