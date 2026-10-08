'use client';

import * as React from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { professionalSchema } from '@/components/profile-form/schema';
import { ProfessionalFields } from '@/components/profile-form/professional-fields';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  saveProfessionalProfile,
  type ProfessionalProfileValues,
} from './actions';

/** The dashboard's Professional profile tab: a judge's company and title. */
export function ProfessionalProfileForm({
  initial,
}: {
  initial: Partial<ProfessionalProfileValues> | null;
}) {
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

  const submit = async (data: ProfessionalProfileValues) => {
    setSaveError(undefined);
    const result = await saveProfessionalProfile(data);
    if (!result.success) {
      setSaveError(result.error ?? 'Failed to save profile.');
      return;
    }
    // The action revalidates this page, so no manual refresh is needed.
    toast.success('Profile saved successfully.');
  };

  const busy = form.formState.isSubmitting;

  return (
    <form
      onSubmit={form.handleSubmit(submit)}
      onChange={() => setSaveError(undefined)}
      className='flex flex-col gap-6'
    >
      <ProfessionalFields form={form} idPrefix='professional-' />
      <div className='flex flex-col items-end gap-2'>
        <Button type='submit' disabled={busy}>
          {busy ? (
            <>
              <Spinner data-icon='inline-start' /> Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
        {saveError && <FieldError>{saveError}</FieldError>}
      </div>
    </form>
  );
}
