'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { updateEventSettings } from '@/app/dashboard/admin/events/actions';
import { updateEventSettingsSchema } from '@/app/dashboard/admin/events/schemas';
import type { UpdateEventSettingsInput } from '@/app/dashboard/admin/events/schemas';
import { LocalDateTime, useZoneAbbreviation } from '@/components/local-date-time';
import { Button } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { AdminEventSettings } from '@/lib/admin-event';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/datetime';

/**
 * Event settings, read-only until Edit is pressed.
 *
 * The event is handed in from the server rather than fetched on mount, so
 * the saved values are in the HTML on first paint instead of after a
 * round-trip through a server action.
 */
export function EventSettingsForm({ event }: { event: AdminEventSettings }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = React.useState(false);
  // Submission failures render under the submit button, not as a toast: a
  // toast disappears and leaves the user guessing which field to fix. See
  // AGENTS.md.
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const defaults = React.useMemo<UpdateEventSettingsInput>(
    () => ({
      name: event.name,
      hasApplication: event.hasApplication,
      capacity: event.capacity ?? undefined,
      startsAt: event.startsAt ? event.startsAt.toISOString() : undefined,
      endsAt: event.endsAt ? event.endsAt.toISOString() : undefined,
      location: event.location ?? undefined,
      latitude: event.latitude ?? undefined,
      longitude: event.longitude ?? undefined,
      radiusMeters: event.radiusMeters ?? undefined,
      isFeatured: event.isFeatured,
      teamsEnabled: event.teamsEnabled,
      maxTeamSize: event.maxTeamSize ?? undefined,
    }),
    [event],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateEventSettingsInput>({
    resolver: zodResolver(updateEventSettingsSchema),
    defaultValues: defaults,
  });

  const teamsEnabled = watch('teamsEnabled');
  const startsAtAbbr = useZoneAbbreviation(watch('startsAt') ?? undefined);
  const endsAtAbbr = useZoneAbbreviation(watch('endsAt') ?? undefined);

  function cancel() {
    setIsEditing(false);
    setSubmitError(null);
    reset(defaults);
  }

  async function onSubmit(data: UpdateEventSettingsInput) {
    setSubmitError(null);
    const result = await updateEventSettings(event.id, data);
    if (!result.success) {
      setSubmitError(result.error || 'Failed to update event');
      return;
    }
    toast.success('Event updated');
    setIsEditing(false);
    // The server action invalidates the event's cache tag; refresh pulls the
    // new values back through the cached getter.
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle>Event settings</CardTitle>
            <CardDescription>
              Configure event details and requirements
            </CardDescription>
          </div>
          {!isEditing && (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!isEditing ? (
          <dl className='space-y-4'>
            <ReadOnly label='Name' value={event.name} />
            <ReadOnly
              label='Application form'
              value={event.hasApplication ? 'Required' : 'Not required'}
            />
            {event.startsAt && (
              <ReadOnly
                label='Starts at'
                value={
                  <LocalDateTime
                    value={event.startsAt}
                    dateStyle='medium'
                    timeStyle='short'
                  />
                }
              />
            )}
            {event.endsAt && (
              <ReadOnly
                label='Ends at'
                value={
                  <LocalDateTime
                    value={event.endsAt}
                    dateStyle='medium'
                    timeStyle='short'
                  />
                }
              />
            )}
            {event.location && (
              <ReadOnly label='Location' value={event.location} />
            )}
            {event.latitude != null && event.longitude != null && (
              <ReadOnly
                label='Pass geofence'
                value={`${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)} (radius ${event.radiusMeters}m)`}
              />
            )}
            <ReadOnly
              label='Capacity'
              value={event.capacity != null ? String(event.capacity) : 'Unlimited'}
            />
            <ReadOnly
              label='Featured on homepage'
              value={event.isFeatured ? 'Yes' : 'No'}
            />
            <ReadOnly
              label='Teams'
              value={
                event.teamsEnabled
                  ? `Enabled (max team size: ${event.maxTeamSize ?? 'uncapped'})`
                  : 'Disabled'
              }
            />
          </dl>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor='name'>
                  Event name <span className='text-destructive'>*</span>
                </FieldLabel>
                <Input
                  id='name'
                  {...register('name')}
                  onChange={(e) => {
                    setSubmitError(null);
                    register('name').onChange(e);
                  }}
                  placeholder='e.g. MRU Hackathon 2026'
                />
                {errors.name && <FieldError errors={[errors.name]} />}
              </Field>

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
                <Label htmlFor='hasApplication'>
                  Requires application form
                </Label>
              </div>

              <Field>
                <FieldLabel htmlFor='capacity'>Capacity (optional)</FieldLabel>
                <FieldDescription>Maximum number of attendees</FieldDescription>
                <Input
                  id='capacity'
                  type='number'
                  {...register('capacity', {
                    setValueAs: (value) => (value === '' ? null : Number(value)),
                  })}
                  placeholder='e.g. 100'
                />
                {errors.capacity && <FieldError errors={[errors.capacity]} />}
              </Field>

              <Field>
                <FieldLabel htmlFor='startsAt'>
                  Starts at ({startsAtAbbr}, optional)
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
                          fromDateTimeLocalValue(
                            e.target.value,
                          )?.toISOString() ?? null,
                        )
                      }
                    />
                  )}
                />
                {errors.startsAt && <FieldError errors={[errors.startsAt]} />}
              </Field>

              <Field>
                <FieldLabel htmlFor='endsAt'>
                  Ends at ({endsAtAbbr}, optional)
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
                          fromDateTimeLocalValue(
                            e.target.value,
                          )?.toISOString() ?? null,
                        )
                      }
                    />
                  )}
                />
                {errors.endsAt && <FieldError errors={[errors.endsAt]} />}
              </Field>

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
                      setValueAs: (value) =>
                        value === '' ? null : Number(value),
                    })}
                    placeholder='Latitude'
                  />
                  <Input
                    id='longitude'
                    type='number'
                    step='any'
                    {...register('longitude', {
                      setValueAs: (value) =>
                        value === '' ? null : Number(value),
                    })}
                    placeholder='Longitude'
                  />
                  <Input
                    id='radiusMeters'
                    type='number'
                    {...register('radiusMeters', {
                      setValueAs: (value) =>
                        value === '' ? null : Number(value),
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

              <div className='flex items-center gap-3'>
                <Controller
                  name='isFeatured'
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id='isFeatured'
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor='isFeatured'>
                  Featured on homepage (its Register URL is used site-wide)
                </Label>
              </div>

              <div className='flex items-center gap-3'>
                <Controller
                  name='teamsEnabled'
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id='teamsEnabled'
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor='teamsEnabled'>
                  Allow participants to form teams
                </Label>
              </div>

              {teamsEnabled && (
                <Field>
                  <FieldLabel htmlFor='maxTeamSize'>
                    Max team size (optional)
                  </FieldLabel>
                  <FieldDescription>Leave blank for no cap.</FieldDescription>
                  <Input
                    id='maxTeamSize'
                    type='number'
                    {...register('maxTeamSize', {
                      setValueAs: (value) =>
                        value === '' ? null : Number(value),
                    })}
                    placeholder='e.g. 4'
                  />
                  {errors.maxTeamSize && (
                    <FieldError errors={[errors.maxTeamSize]} />
                  )}
                </Field>
              )}
            </FieldGroup>

            <div className='flex flex-col items-end gap-2 pt-2'>
              {submitError && (
                <p
                  role='alert'
                  className='text-destructive w-full text-right text-sm'
                >
                  {submitError}
                </p>
              )}
              <div className='flex gap-2'>
                <Button type='button' variant='outline' onClick={cancel}>
                  Cancel
                </Button>
                <Button type='submit' disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ReadOnly({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className='text-muted-foreground text-xs font-semibold uppercase'>
        {label}
      </dt>
      <dd className='m-0 mt-1 text-sm'>{value}</dd>
    </div>
  );
}
