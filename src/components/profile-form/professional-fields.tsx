'use client';

import type { UseFormReturn } from 'react-hook-form';

import type { ProfessionalProfileValues } from '@/app/dashboard/profile/actions';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  RequiredAsterisk,
} from '@/components/ui/field';

/**
 * Company and job title — shared by the judge onboarding step and the
 * dashboard profile page's Professional profile tab. LinkedIn isn't here: it's
 * one shared value, asked for on the Personal step/tab.
 */
export function ProfessionalFields({
  form,
  idPrefix = '',
}: {
  form: UseFormReturn<ProfessionalProfileValues>;
  /** Keeps input ids unique when another form on the page shares a field name. */
  idPrefix?: string;
}) {
  const { errors } = form.formState;
  const id = (name: string) => `${idPrefix}${name}`;
  return (
    <FieldGroup>
      <Field data-invalid={Boolean(errors.company)}>
        <FieldLabel htmlFor={id('company')}>
          Company or organization
          <RequiredAsterisk />
        </FieldLabel>
        <Input
          id={id('company')}
          autoComplete='organization'
          aria-invalid={Boolean(errors.company)}
          {...form.register('company')}
        />
        {errors.company && <FieldError errors={[errors.company]} />}
      </Field>
      <Field data-invalid={Boolean(errors.jobTitle)}>
        <FieldLabel htmlFor={id('jobTitle')}>
          Job title
          <RequiredAsterisk />
        </FieldLabel>
        <Input
          id={id('jobTitle')}
          autoComplete='organization-title'
          aria-invalid={Boolean(errors.jobTitle)}
          {...form.register('jobTitle')}
        />
        {errors.jobTitle && <FieldError errors={[errors.jobTitle]} />}
      </Field>
    </FieldGroup>
  );
}
