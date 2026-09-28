'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { createEvent } from '@/app/dashboard/admin/events/actions';
import { createEventSchema } from '@/app/dashboard/admin/events/schemas';
import type { CreateEventInput } from '@/app/dashboard/admin/events/schemas';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/datetime';
import { parseOptionalNumber } from '@/lib/form-values';
import { slugify } from '@/lib/slug';
import { useZoneAbbreviation } from '@/components/local-date-time';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldDescription,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function CreateEventDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // A rejected submit (most often a slug another event already uses) renders
  // above the footer rather than as a toast, so the message stays next to the
  // fields being corrected. See AGENTS.md.
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateEventInput>({
    resolver: zodResolver(createEventSchema) as Resolver<CreateEventInput>,
    defaultValues: {
      name: '',
      hasApplication: false,
    },
  });

  const startsAtAbbr = useZoneAbbreviation(watch('startsAt') ?? undefined);
  const endsAtAbbr = useZoneAbbreviation(watch('endsAt') ?? undefined);
  const suggestedSlug = slugify(watch('name') ?? '');

  const onSubmit = async (data: CreateEventInput) => {
    setSubmitError(null);
    const result = await createEvent(data);
    if (result.success && result.data) {
      toast.success('Event created successfully');
      setOpen(false);
      reset();
      // Navigate to the new event
      router.push(`/dashboard/admin/events/${result.data.id}`);
    } else if (!result.success) {
      setSubmitError(result.error || 'Failed to create event');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reopening starts clean rather than showing the last attempt's error.
        if (!next) setSubmitError(null);
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <Plus className='mr-2 size-4' />
        Create Event
      </Button>

      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Create New Event</DialogTitle>
          <DialogDescription>
            Add a new event to your organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
          <FieldGroup className='gap-4'>
            {/* Name */}
            <Field>
              <FieldLabel htmlFor='name'>
                Event Name <span className='text-destructive'>*</span>
              </FieldLabel>
              <Input
                id='name'
                {...register('name')}
                placeholder='e.g. MRU Hackathon 2026'
              />
              {errors.name && <FieldError errors={[errors.name]} />}
            </Field>

            {/* URL slug */}
            <Field>
              <FieldLabel htmlFor='slug'>URL slug (optional)</FieldLabel>
              <FieldDescription>
                Gives the event a readable link —{' '}
                <span className='font-mono'>/dashboard/events/{'{slug}'}</span>.
                Leave blank to use the event id.
              </FieldDescription>
              <Input
                id='slug'
                {...register('slug')}
                placeholder={suggestedSlug || 'mruhacks-2026'}
              />
              {errors.slug && <FieldError errors={[errors.slug]} />}
            </Field>

            {/* Has Application */}
            <div className='flex items-center gap-3'>
              <Controller
                name='hasApplication'
                control={control}
                render={({ field }) => (
                  <Switch
                    id='hasApplication'
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor='hasApplication'>Requires application form</Label>
            </div>

            {/* Capacity */}
            <Field>
              <FieldLabel htmlFor='capacity'>Capacity (optional)</FieldLabel>
              <FieldDescription>
                Leave blank for unlimited attendees.
              </FieldDescription>
              <Input
                id='capacity'
                type='number'
                {...register('capacity', {
                  setValueAs: parseOptionalNumber,
                })}
                placeholder='e.g. 100'
              />
              {errors.capacity && <FieldError errors={[errors.capacity]} />}
            </Field>

            {/* Starts At */}
            <Field>
              <FieldLabel htmlFor='startsAt'>
                Starts At ({startsAtAbbr}, optional)
              </FieldLabel>
              <Controller
                name='startsAt'
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id='startsAt'
                    type='datetime-local'
                    value={
                      field.value
                        ? toDateTimeLocalValue(new Date(field.value))
                        : ''
                    }
                    onChange={(e) =>
                      field.onChange(
                        fromDateTimeLocalValue(e.target.value)?.toISOString() ??
                          null,
                      )
                    }
                  />
                )}
              />
              {errors.startsAt && <FieldError errors={[errors.startsAt]} />}
            </Field>

            {/* Ends At */}
            <Field>
              <FieldLabel htmlFor='endsAt'>
                Ends At ({endsAtAbbr}, optional)
              </FieldLabel>
              <Controller
                name='endsAt'
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id='endsAt'
                    type='datetime-local'
                    value={
                      field.value
                        ? toDateTimeLocalValue(new Date(field.value))
                        : ''
                    }
                    onChange={(e) =>
                      field.onChange(
                        fromDateTimeLocalValue(e.target.value)?.toISOString() ??
                          null,
                      )
                    }
                  />
                )}
              />
              {errors.endsAt && <FieldError errors={[errors.endsAt]} />}
            </Field>

            {/* Location */}
            <Field>
              <FieldLabel htmlFor='location'>Location (optional)</FieldLabel>
              <FieldDescription>
                Shown on the event page and Apple Wallet pass
              </FieldDescription>
              <Input
                id='location'
                {...register('location')}
                placeholder='e.g. Riddell Library & Learning Centre'
              />
              {errors.location && <FieldError errors={[errors.location]} />}
            </Field>

            {/* Geofence (lat/long/radius) */}
            <Field>
              <FieldLabel htmlFor='latitude'>
                Pass geofence (optional)
              </FieldLabel>
              <FieldDescription>
                Triggers the Apple Wallet pass when nearby. Set all three, or
                leave all blank.
              </FieldDescription>
              <div className='grid grid-cols-3 gap-2'>
                <Input
                  id='latitude'
                  type='number'
                  step='any'
                  {...register('latitude', {
                    setValueAs: parseOptionalNumber,
                  })}
                  placeholder='Latitude'
                />
                <Input
                  id='longitude'
                  type='number'
                  step='any'
                  {...register('longitude', {
                    setValueAs: parseOptionalNumber,
                  })}
                  placeholder='Longitude'
                />
                <Input
                  id='radiusMeters'
                  type='number'
                  {...register('radiusMeters', {
                    setValueAs: parseOptionalNumber,
                  })}
                  placeholder='Radius (m)'
                />
              </div>
              {errors.latitude && <FieldError errors={[errors.latitude]} />}
              {errors.longitude && <FieldError errors={[errors.longitude]} />}
              {errors.radiusMeters && (
                <FieldError errors={[errors.radiusMeters]} />
              )}
            </Field>
          </FieldGroup>

          {submitError && <FieldError>{submitError}</FieldError>}

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setOpen(false);
                setSubmitError(null);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Event'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
