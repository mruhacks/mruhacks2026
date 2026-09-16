'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { updateEventSettings } from '@/app/dashboard/admin/events/actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const rsvpSettingsSchema = z.object({
  rsvpResponseWindowHours: z
    .number()
    .int()
    .min(1, 'RSVP response window must be at least 1 hour')
    .max(720, 'RSVP response window cannot exceed 720 hours'),
});

type RsvpSettingsInput = z.infer<typeof rsvpSettingsSchema>;

type Props = {
  eventId: string;
  rsvpResponseWindowHours: number;
  onSaved?: (hours: number) => void;
};

export function RsvpSettingsCard({
  eventId,
  rsvpResponseWindowHours,
  onSaved,
}: Props) {
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RsvpSettingsInput>({
    resolver: zodResolver(rsvpSettingsSchema),
    defaultValues: { rsvpResponseWindowHours },
  });

  React.useEffect(() => {
    reset({ rsvpResponseWindowHours });
  }, [rsvpResponseWindowHours, reset]);

  const onSubmit = async (data: RsvpSettingsInput) => {
    setFormError(null);
    const result = await updateEventSettings(eventId, {
      rsvpResponseWindowHours: data.rsvpResponseWindowHours,
    });
    if (!result.success) {
      setFormError(result.error || 'Failed to save RSVP settings');
      return;
    }
    toast.success('RSVP settings saved');
    onSaved?.(data.rsvpResponseWindowHours);
    reset({ rsvpResponseWindowHours: data.rsvpResponseWindowHours });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>RSVP Settings</CardTitle>
        <CardDescription>Changes apply to future waves only.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className='flex flex-col gap-4'>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='rsvpResponseWindowHours'>
                Response window (hours)
              </FieldLabel>
              <FieldDescription>
                Time invited applicants have to accept or decline.
              </FieldDescription>
              <Input
                id='rsvpResponseWindowHours'
                type='number'
                {...register('rsvpResponseWindowHours', {
                  setValueAs: (value) =>
                    value === '' ? undefined : Number(value),
                  onChange: () => setFormError(null),
                })}
              />
              {errors.rsvpResponseWindowHours && (
                <FieldError errors={[errors.rsvpResponseWindowHours]} />
              )}
              {formError && <FieldError errors={[{ message: formError }]} />}
            </Field>
          </FieldGroup>
          <div className='flex justify-end'>
            <Button type='submit' disabled={isSubmitting || !isDirty}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
