'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

import { createSubevent } from '@/app/dashboard/admin/events/subevent-actions';
import {
  createSubeventSchema,
  type CreateSubeventInput,
} from '@/app/dashboard/admin/events/schemas';
import { useZoneAbbreviation } from '@/components/local-date-time';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/datetime';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/**
 * Adds a sub-event. Deliberately only four fields — a sub-event is a name, a
 * window and a place; everything else on `events` stays at the safe default
 * `createSubevent` pins.
 *
 * `datetime-local` gives a browser-local wall clock, so both instants are
 * converted before they leave the client and the server only ever sees a real
 * UTC instant (see AGENTS.md).
 */
export function CreateSubeventDialog({
  eventId,
  defaultStartsAt,
}: {
  eventId: string;
  /** The parent's start instant (ISO with `Z`), used to seed the date. */
  defaultStartsAt: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateSubeventInput>({
    resolver: zodResolver(createSubeventSchema),
    defaultValues: {
      name: '',
      // Seeded from the parent so the common case — a meal on one of the event's
      // own days — needs only the time changed. Not a constraint: an organizer
      // can still put a sub-event wherever they want.
      startsAt: defaultStartsAt ?? '',
      endsAt: '',
      location: '',
    },
  });

  const startsAt = watch('startsAt');
  const endsAt = watch('endsAt');
  const startsAtAbbr = useZoneAbbreviation(startsAt || undefined);
  const endsAtAbbr = useZoneAbbreviation(endsAt || undefined);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Reopening starts clean rather than showing the last attempt's error.
    if (!next) {
      reset();
      setSubmitError(null);
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const result = await createSubevent(eventId, {
      ...values,
      location: values.location?.trim() || null,
    });

    if (!result.success) {
      setSubmitError(result.error);
      return;
    }

    handleOpenChange(false);
    toast.success(`${values.name} added`);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant='ghost' size='sm'>
          <Plus aria-hidden className='size-4' />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>New sub-event</DialogTitle>
          <DialogDescription>
            Meals, workshops and ceremonies participants can be checked into
            separately, using the pass they already have.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className='space-y-4'>
          <FieldGroup className='gap-4'>
            <Field className='gap-1.5' data-invalid={!!errors.name}>
              <FieldLabel htmlFor='subevent-name'>Name</FieldLabel>
              <Input
                id='subevent-name'
                aria-invalid={!!errors.name}
                placeholder='e.g. Saturday lunch'
                {...register('name')}
              />
              {errors.name && <FieldError errors={[errors.name]} />}
            </Field>

            <FieldGroup className='grid gap-3 sm:grid-cols-2'>
              <Field className='gap-1.5' data-invalid={!!errors.startsAt}>
                <FieldLabel htmlFor='subevent-startsAt'>
                  Starts ({startsAtAbbr})
                </FieldLabel>
                <Controller
                  name='startsAt'
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id='subevent-startsAt'
                      aria-invalid={!!errors.startsAt}
                      type='datetime-local'
                      value={
                        field.value
                          ? toDateTimeLocalValue(new Date(field.value))
                          : ''
                      }
                      onChange={(event) =>
                        field.onChange(
                          fromDateTimeLocalValue(
                            event.target.value,
                          )?.toISOString() ?? '',
                        )
                      }
                    />
                  )}
                />
                {errors.startsAt && <FieldError errors={[errors.startsAt]} />}
              </Field>

              <Field className='gap-1.5' data-invalid={!!errors.endsAt}>
                <FieldLabel htmlFor='subevent-endsAt'>
                  Ends ({endsAtAbbr})
                </FieldLabel>
                <Controller
                  name='endsAt'
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id='subevent-endsAt'
                      aria-invalid={!!errors.endsAt}
                      type='datetime-local'
                      value={
                        field.value
                          ? toDateTimeLocalValue(new Date(field.value))
                          : ''
                      }
                      onChange={(event) =>
                        field.onChange(
                          fromDateTimeLocalValue(
                            event.target.value,
                          )?.toISOString() ?? '',
                        )
                      }
                    />
                  )}
                />
                {errors.endsAt && <FieldError errors={[errors.endsAt]} />}
              </Field>
            </FieldGroup>

            <Field className='gap-1.5' data-invalid={!!errors.location}>
              <FieldLabel htmlFor='subevent-location'>
                Location (optional)
              </FieldLabel>
              <FieldDescription>
                Shown on the participant schedule.
              </FieldDescription>
              <Input
                id='subevent-location'
                aria-invalid={!!errors.location}
                placeholder='e.g. EA 1042'
                {...register('location')}
              />
              {errors.location && <FieldError errors={[errors.location]} />}
            </Field>
          </FieldGroup>

          {submitError && <FieldError>{submitError}</FieldError>}

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add sub-event'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
