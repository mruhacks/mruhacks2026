'use client';

import * as React from 'react';
import Link from 'next/link';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';

import { updateEventSettings } from '@/app/dashboard/admin/events/actions';
import { eventSettingsFormSchema } from '@/app/dashboard/admin/events/schemas';
import type { UpdateEventSettingsInput } from '@/app/dashboard/admin/events/schemas';
import { useZoneAbbreviation } from '@/components/local-date-time';
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
  FieldContent,
  FieldSet,
  FieldLegend,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { AdminEventSettings } from '@/lib/admin-event';
import { adminEventPath } from '@/lib/event-slug';
import { slugify } from '@/lib/slug';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/datetime';
import { parseOptionalNumber } from '@/lib/form-values';

import { useEventBasePath } from '../_components/use-event-base-path';

export function EventSettingsForm({ event }: { event: AdminEventSettings }) {
  const router = useRouter();
  const basePath = useEventBasePath();
  // Submission failures render under the submit button, not as a toast: a
  // toast disappears and leaves the user guessing which field to fix. See
  // AGENTS.md.
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const defaults = React.useMemo<UpdateEventSettingsInput>(
    () => ({
      name: event.name,
      // '' rather than undefined: the input is controlled by `register`, and
      // an empty string is also how the action is told to clear the slug.
      slug: event.slug ?? '',
      hasApplication: event.hasApplication,
      capacity: event.capacity ?? null,
      startsAt: event.startsAt ? event.startsAt.toISOString() : undefined,
      endsAt: event.endsAt ? event.endsAt.toISOString() : undefined,
      location: event.location ?? undefined,
      latitude: event.latitude ?? null,
      longitude: event.longitude ?? null,
      radiusMeters: event.radiusMeters ?? null,
      isFeatured: event.isFeatured,
      teamsEnabled: event.teamsEnabled,
      maxTeamSize: event.maxTeamSize ?? null,
    }),
    [event],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateEventSettingsInput>({
    resolver: zodResolver(eventSettingsFormSchema),
    defaultValues: defaults,
  });

  const [teamsEnabled, startsAt, endsAt, name, slug] = useWatch({
    control,
    name: ['teamsEnabled', 'startsAt', 'endsAt', 'name', 'slug'],
  });
  // What the participant URL will look like once saved — the uuid is the
  // fallback for an event with no slug.
  const urlSegment = slug?.trim() || event.id;
  const suggestedSlug = slugify(name ?? '');
  const startsAtAbbr = useZoneAbbreviation(startsAt ?? undefined);
  const endsAtAbbr = useZoneAbbreviation(endsAt ?? undefined);

  async function onSubmit(data: UpdateEventSettingsInput) {
    setSubmitError(null);
    try {
      const result = await updateEventSettings(event.id, data);
      if (!result.success) {
        setSubmitError(result.error || 'Failed to update event');
        return;
      }
      toast.success('Event updated');
      reset(data);

      // Editing the slug moves this very page: the URL we are on carries the
      // old segment, which no longer resolves. Navigate to the new one rather
      // than refreshing into a 404.
      const nextSlug = data.slug?.trim() || null;
      if (nextSlug !== (event.slug ?? null)) {
        router.replace(
          `${adminEventPath({ id: event.id, slug: nextSlug })}/settings`,
        );
        return;
      }

      // Event data is rendered by Server Components, not a React Query cache.
      // eslint-disable-next-line custom/no-router-refresh
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      setSubmitError('Unable to save event details. Please try again.');
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onChangeCapture={() => setSubmitError(null)}
      className='flex flex-col gap-4'
    >
      <fieldset disabled={isSubmitting} className='min-w-0'>
        <FieldGroup className='grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'>
          <FieldGroup className='min-w-0 gap-4'>
            <Card className='gap-4 py-5'>
              <CardHeader className='gap-1 px-5'>
                <CardTitle>Event page</CardTitle>
                <CardDescription>
                  What participants see when they find your event.
                </CardDescription>
              </CardHeader>
              <CardContent className='px-5'>
                <FieldGroup className='gap-4'>
                  <Field className='gap-1.5' data-invalid={!!errors.name}>
                    <FieldLabel htmlFor='name'>
                      Event name <span className='text-destructive'>*</span>
                    </FieldLabel>
                    <Input
                      id='name'
                      aria-invalid={!!errors.name}
                      {...register('name')}
                      onChange={(e) => {
                        setSubmitError(null);
                        register('name').onChange(e);
                      }}
                      placeholder='e.g. MRU Hackathon 2026'
                    />
                    {errors.name && <FieldError errors={[errors.name]} />}
                  </Field>
                  <Field className='gap-1.5' data-invalid={!!errors.slug}>
                    <FieldLabel htmlFor='slug'>URL slug (optional)</FieldLabel>
                    <Input
                      id='slug'
                      aria-invalid={!!errors.slug}
                      {...register('slug')}
                      onChange={(e) => {
                        setSubmitError(null);
                        register('slug').onChange(e);
                      }}
                      placeholder={suggestedSlug || 'mruhacks-2026'}
                    />
                    <FieldDescription>
                      Participants reach this event at{' '}
                      <span className='font-mono break-all'>
                        /dashboard/events/{urlSegment}
                      </span>
                      . Leave blank to keep using the event id.
                    </FieldDescription>
                    {errors.slug && <FieldError errors={[errors.slug]} />}
                  </Field>
                  <Button
                    asChild
                    variant='outline'
                    size='sm'
                    className='self-start'
                  >
                    <Link href={`${basePath}/settings/description`}>
                      <Pencil aria-hidden data-icon='inline-start' />
                      Edit description
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant='outline'
                    size='sm'
                    className='self-start'
                  >
                    <Link href={`${basePath}/settings/terms`}>
                      <Pencil aria-hidden data-icon='inline-start' />
                      Edit Event Terms
                    </Link>
                  </Button>
                  <Field orientation='horizontal' className='gap-4'>
                    <FieldContent>
                      <FieldLabel htmlFor='isFeatured'>
                        Feature on homepage
                      </FieldLabel>
                      <FieldDescription>
                        Use this event for the homepage registration link.
                      </FieldDescription>
                    </FieldContent>
                    <Controller
                      name='isFeatured'
                      control={control}
                      render={({ field }) => (
                        <Switch
                          id='isFeatured'
                          checked={field.value ?? false}
                          onCheckedChange={(value) => {
                            setSubmitError(null);
                            field.onChange(value);
                          }}
                        />
                      )}
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
            <Card className='gap-4 py-5'>
              <CardHeader className='gap-1 px-5'>
                <CardTitle>When &amp; where</CardTitle>
                <CardDescription>
                  Set the schedule and venue when they’re confirmed.
                </CardDescription>
              </CardHeader>
              <CardContent className='px-5'>
                <FieldGroup className='gap-4'>
                  <FieldGroup className='grid gap-3 sm:grid-cols-2'>
                    <Field className='gap-1.5' data-invalid={!!errors.startsAt}>
                      <FieldLabel htmlFor='startsAt'>
                        Starts ({startsAtAbbr})
                      </FieldLabel>
                      <Controller
                        name='startsAt'
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            id='startsAt'
                            aria-invalid={!!errors.startsAt}
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
                      {errors.startsAt && (
                        <FieldError errors={[errors.startsAt]} />
                      )}
                    </Field>
                    <Field className='gap-1.5' data-invalid={!!errors.endsAt}>
                      <FieldLabel htmlFor='endsAt'>
                        Ends ({endsAtAbbr})
                      </FieldLabel>
                      <Controller
                        name='endsAt'
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            id='endsAt'
                            aria-invalid={!!errors.endsAt}
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
                  </FieldGroup>
                  <Field className='gap-1.5' data-invalid={!!errors.location}>
                    <FieldLabel htmlFor='location'>
                      Location (optional)
                    </FieldLabel>
                    <Input
                      id='location'
                      aria-invalid={!!errors.location}
                      {...register('location')}
                      placeholder='e.g. Riddell Library & Learning Centre'
                    />
                    {errors.location && (
                      <FieldError errors={[errors.location]} />
                    )}
                  </Field>
                  <FieldSet className='gap-2'>
                    <FieldLegend variant='label' className='mb-0'>
                      Wallet pass location (optional)
                    </FieldLegend>
                    <FieldGroup className='grid gap-3 sm:grid-cols-3'>
                      <Field
                        className='gap-1.5'
                        data-invalid={!!errors.latitude}
                      >
                        <FieldLabel htmlFor='latitude'>Latitude</FieldLabel>
                        <Input
                          id='latitude'
                          type='number'
                          step='any'
                          aria-invalid={!!errors.latitude}
                          {...register('latitude', {
                            setValueAs: parseOptionalNumber,
                          })}
                          placeholder='e.g. 51.012'
                        />
                        {errors.latitude && (
                          <FieldError errors={[errors.latitude]} />
                        )}
                      </Field>
                      <Field
                        className='gap-1.5'
                        data-invalid={!!errors.longitude}
                      >
                        <FieldLabel htmlFor='longitude'>Longitude</FieldLabel>
                        <Input
                          id='longitude'
                          type='number'
                          step='any'
                          aria-invalid={!!errors.longitude}
                          {...register('longitude', {
                            setValueAs: parseOptionalNumber,
                          })}
                          placeholder='e.g. -114.13'
                        />
                        {errors.longitude && (
                          <FieldError errors={[errors.longitude]} />
                        )}
                      </Field>
                      <Field
                        className='gap-1.5'
                        data-invalid={!!errors.radiusMeters}
                      >
                        <FieldLabel htmlFor='radiusMeters'>
                          Radius (m)
                        </FieldLabel>
                        <Input
                          id='radiusMeters'
                          type='number'
                          step='1'
                          aria-invalid={!!errors.radiusMeters}
                          {...register('radiusMeters', {
                            setValueAs: parseOptionalNumber,
                          })}
                          placeholder='e.g. 150'
                        />
                        {errors.radiusMeters && (
                          <FieldError errors={[errors.radiusMeters]} />
                        )}
                      </Field>
                    </FieldGroup>
                    <FieldDescription>
                      Suggest the pass near the venue. Set all three values, or
                      leave them blank.
                    </FieldDescription>
                  </FieldSet>
                </FieldGroup>
              </CardContent>
            </Card>
          </FieldGroup>
          <FieldGroup className='min-w-0 gap-4'>
            <Card className='gap-4 py-5'>
              <CardHeader className='gap-1 px-5'>
                <CardTitle>Registration</CardTitle>
                <CardDescription>
                  Who can attend and how many places are available.
                </CardDescription>
              </CardHeader>
              <CardContent className='px-5'>
                <FieldGroup className='gap-4'>
                  <Field orientation='horizontal' className='gap-4'>
                    <FieldContent>
                      <FieldLabel htmlFor='hasApplication'>
                        Require an application
                      </FieldLabel>
                      <FieldDescription>
                        Participants apply before they can attend.
                      </FieldDescription>
                    </FieldContent>
                    <Controller
                      name='hasApplication'
                      control={control}
                      render={({ field }) => (
                        <Switch
                          id='hasApplication'
                          checked={field.value ?? false}
                          onCheckedChange={(value) => {
                            setSubmitError(null);
                            field.onChange(value);
                          }}
                        />
                      )}
                    />
                  </Field>
                  <Field className='gap-1.5' data-invalid={!!errors.capacity}>
                    <FieldLabel htmlFor='capacity'>
                      Attendee capacity
                    </FieldLabel>
                    <Input
                      id='capacity'
                      aria-invalid={!!errors.capacity}
                      type='number'
                      {...register('capacity', {
                        setValueAs: parseOptionalNumber,
                      })}
                      placeholder='Unlimited'
                    />
                    <FieldDescription>
                      Total attendees. Leave blank for no limit.
                    </FieldDescription>
                    {errors.capacity && (
                      <FieldError errors={[errors.capacity]} />
                    )}
                  </Field>
                  <Button
                    asChild
                    variant='outline'
                    size='sm'
                    className='self-start'
                  >
                    <Link href={`${basePath}/settings/questions`}>
                      Edit application questions
                    </Link>
                  </Button>
                </FieldGroup>
              </CardContent>
            </Card>
            <Card className='gap-4 py-5'>
              <CardHeader className='gap-1 px-5'>
                <CardTitle>Teams</CardTitle>
                <CardDescription>
                  How participants work together.
                </CardDescription>
              </CardHeader>
              <CardContent className='px-5'>
                <FieldGroup className='gap-4'>
                  <Field orientation='horizontal' className='gap-4'>
                    <FieldContent>
                      <FieldLabel htmlFor='teamsEnabled'>
                        Allow teams
                      </FieldLabel>
                      <FieldDescription>
                        Participants can create and join teams.
                      </FieldDescription>
                    </FieldContent>
                    <Controller
                      name='teamsEnabled'
                      control={control}
                      render={({ field }) => (
                        <Switch
                          id='teamsEnabled'
                          checked={field.value ?? false}
                          onCheckedChange={(value) => {
                            setSubmitError(null);
                            field.onChange(value);
                          }}
                        />
                      )}
                    />
                  </Field>
                  {teamsEnabled && (
                    <Field
                      className='gap-1.5'
                      data-invalid={!!errors.maxTeamSize}
                    >
                      <FieldLabel htmlFor='maxTeamSize'>
                        Members per team
                      </FieldLabel>
                      <Input
                        id='maxTeamSize'
                        aria-invalid={!!errors.maxTeamSize}
                        type='number'
                        {...register('maxTeamSize', {
                          setValueAs: parseOptionalNumber,
                        })}
                        placeholder='No limit'
                      />
                      <FieldDescription>
                        Leave blank for no team size limit.
                      </FieldDescription>
                      {errors.maxTeamSize && (
                        <FieldError errors={[errors.maxTeamSize]} />
                      )}
                    </Field>
                  )}
                </FieldGroup>
              </CardContent>
            </Card>
          </FieldGroup>
        </FieldGroup>
      </fieldset>
      <div className='flex flex-col gap-3'>
        {submitError && <FieldError role='alert'>{submitError}</FieldError>}
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <Button asChild variant='outline'>
            <Link href={basePath}>Back to event</Link>
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save event settings'}
          </Button>
        </div>
      </div>
    </form>
  );
}
