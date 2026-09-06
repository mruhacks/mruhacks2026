'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  getEventDetails,
  updateEventSettings,
} from '@/app/dashboard/admin/events/actions';
import { useBreadcrumbSegment } from '@/components/breadcrumb-context';
import { updateEventSettingsSchema } from '@/app/dashboard/admin/events/schemas';
import type { EventDetails } from '@/app/dashboard/admin/events/actions';
import type { UpdateEventSettingsInput } from '@/app/dashboard/admin/events/schemas';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { EventDescriptionCard } from './event-description-card';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/datetime';
import {
  LocalDateTime,
  useZoneAbbreviation,
} from '@/components/local-date-time';

type EventOverviewPageProps = {
  params: Promise<{ eventId: string }>;
};

export default function EventOverviewPage({ params }: EventOverviewPageProps) {
  const [eventId, setEventId] = React.useState<string | null>(null);
  const [event, setEvent] = React.useState<EventDetails | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isEditing, setIsEditing] = React.useState(false);
  useBreadcrumbSegment(eventId, event?.name);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateEventSettingsInput>({
    resolver: zodResolver(updateEventSettingsSchema),
  });

  React.useEffect(() => {
    params.then((p) => setEventId(p.eventId));
  }, [params]);

  React.useEffect(() => {
    if (!eventId) return;

    async function fetchEvent() {
      const result = await getEventDetails(eventId as string);
      if (result.success && result.data) {
        setEvent(result.data);
        reset({
          name: result.data.name,
          hasApplication: result.data.hasApplication,
          capacity: result.data.capacity ?? undefined,
          startsAt: result.data.startsAt
            ? result.data.startsAt.toISOString()
            : undefined,
          endsAt: result.data.endsAt
            ? result.data.endsAt.toISOString()
            : undefined,
          location: result.data.location ?? undefined,
          latitude: result.data.latitude ?? undefined,
          longitude: result.data.longitude ?? undefined,
          radiusMeters: result.data.radiusMeters ?? undefined,
          isFeatured: result.data.isFeatured,
          teamsEnabled: result.data.teamsEnabled,
          maxTeamSize: result.data.maxTeamSize ?? undefined,
        });
      } else if (!result.success) {
        toast.error(result.error || 'Failed to load event');
      }
      setLoading(false);
    }
    fetchEvent();
  }, [eventId, reset]);

  const hasApplication = watch('hasApplication');
  const teamsEnabled = watch('teamsEnabled');
  const startsAtAbbr = useZoneAbbreviation(watch('startsAt') ?? undefined);
  const endsAtAbbr = useZoneAbbreviation(watch('endsAt') ?? undefined);

  const onSubmit = async (data: UpdateEventSettingsInput) => {
    if (!eventId) return;
    const result = await updateEventSettings(eventId, data);
    if (result.success) {
      toast.success('Event updated successfully');
      setIsEditing(false);
      // Refetch event details
      const detailResult = await getEventDetails(eventId);
      if (detailResult.success && detailResult.data) {
        setEvent(detailResult.data);
      }
    } else {
      toast.error(result.error || 'Failed to update event');
    }
  };

  if (loading) {
    return (
      <div className='text-muted-foreground py-8 text-center'>Loading...</div>
    );
  }

  if (!event) {
    return (
      <div className='text-destructive py-8 text-center'>Event not found</div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Stats Overview */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-muted-foreground text-sm font-medium'>
              Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{event.applicationsCount}</div>
            <p className='text-muted-foreground mt-1 text-xs'>submitted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-muted-foreground text-sm font-medium'>
              Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{event.questionsCount}</div>
            <p className='text-muted-foreground mt-1 text-xs'>active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-muted-foreground text-sm font-medium'>
              Capacity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{event.capacity ?? '—'}</div>
            <p className='text-muted-foreground mt-1 text-xs'>max attendees</p>
          </CardContent>
        </Card>
      </div>

      {/* Participant-facing description. Remounted on event load so the
          editor picks up the saved markdown rather than an empty draft. */}
      <EventDescriptionCard
        key={event.id}
        eventId={event.id}
        initialMarkdown={event.descriptionMarkdown}
      />

      {/* Event Settings Card */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle>Event Settings</CardTitle>
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
            <div className='space-y-4'>
              <div>
                <p className='text-muted-foreground text-xs font-semibold uppercase'>
                  Name
                </p>
                <p className='mt-1 text-sm'>{event.name}</p>
              </div>
              <div>
                <p className='text-muted-foreground text-xs font-semibold uppercase'>
                  Application Form
                </p>
                <p className='mt-1 text-sm'>
                  {event.hasApplication ? 'Required' : 'Not required'}
                </p>
              </div>
              {event.startsAt && (
                <div>
                  <p className='text-muted-foreground text-xs font-semibold uppercase'>
                    Starts At
                  </p>
                  <p className='mt-1 text-sm'>
                    <LocalDateTime
                      value={event.startsAt}
                      dateStyle='medium'
                      timeStyle='short'
                    />
                  </p>
                </div>
              )}
              {event.endsAt && (
                <div>
                  <p className='text-muted-foreground text-xs font-semibold uppercase'>
                    Ends At
                  </p>
                  <p className='mt-1 text-sm'>
                    <LocalDateTime
                      value={event.endsAt}
                      dateStyle='medium'
                      timeStyle='short'
                    />
                  </p>
                </div>
              )}
              {event.location && (
                <div>
                  <p className='text-muted-foreground text-xs font-semibold uppercase'>
                    Location
                  </p>
                  <p className='mt-1 text-sm'>{event.location}</p>
                </div>
              )}
              {event.latitude != null && event.longitude != null && (
                <div>
                  <p className='text-muted-foreground text-xs font-semibold uppercase'>
                    Pass Geofence
                  </p>
                  <p className='mt-1 text-sm'>
                    {event.latitude.toFixed(5)}, {event.longitude.toFixed(5)}{' '}
                    (radius {event.radiusMeters}m)
                  </p>
                </div>
              )}
              <div>
                <p className='text-muted-foreground text-xs font-semibold uppercase'>
                  Featured on Homepage
                </p>
                <p className='mt-1 text-sm'>
                  {event.isFeatured ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <p className='text-muted-foreground text-xs font-semibold uppercase'>
                  Teams
                </p>
                <p className='mt-1 text-sm'>
                  {event.teamsEnabled
                    ? `Enabled (max team size: ${event.maxTeamSize ?? 'uncapped'})`
                    : 'Disabled'}
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
              <FieldGroup>
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
                  <Label htmlFor='hasApplication'>
                    Requires application form
                  </Label>
                </div>

                {/* Capacity */}
                <Field>
                  <FieldLabel htmlFor='capacity'>
                    Capacity (optional)
                  </FieldLabel>
                  <FieldDescription>
                    Maximum number of attendees
                  </FieldDescription>
                  <Input
                    id='capacity'
                    type='number'
                    {...register('capacity', {
                      setValueAs: (value) =>
                        value === '' ? undefined : Number(value),
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

                {/* Location */}
                <Field>
                  <FieldLabel htmlFor='location'>
                    Location (optional)
                  </FieldLabel>
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
                    Triggers the Apple Wallet pass when nearby. Set all three,
                    or leave all blank.
                  </FieldDescription>
                  <div className='grid grid-cols-3 gap-2'>
                    <Input
                      id='latitude'
                      type='number'
                      step='any'
                      {...register('latitude', {
                        setValueAs: (value) =>
                          value === '' ? undefined : Number(value),
                      })}
                      placeholder='Latitude'
                    />
                    <Input
                      id='longitude'
                      type='number'
                      step='any'
                      {...register('longitude', {
                        setValueAs: (value) =>
                          value === '' ? undefined : Number(value),
                      })}
                      placeholder='Longitude'
                    />
                    <Input
                      id='radiusMeters'
                      type='number'
                      {...register('radiusMeters', {
                        setValueAs: (value) =>
                          value === '' ? undefined : Number(value),
                      })}
                      placeholder='Radius (m)'
                    />
                  </div>
                  {errors.latitude && <FieldError errors={[errors.latitude]} />}
                  {errors.longitude && (
                    <FieldError errors={[errors.longitude]} />
                  )}
                  {errors.radiusMeters && (
                    <FieldError errors={[errors.radiusMeters]} />
                  )}
                </Field>

                {/* Featured on homepage */}
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

                {/* Teams enabled */}
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

                {/* Max team size */}
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

              <div className='flex justify-end gap-2 pt-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    setIsEditing(false);
                    reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type='submit' disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
