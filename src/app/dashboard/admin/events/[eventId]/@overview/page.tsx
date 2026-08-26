'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { getEventDetails, updateEventSettings } from '@/app/dashboard/admin/events/actions';
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
          startsAt: result.data.startsAt ? result.data.startsAt.toISOString().slice(0, 16) : undefined,
          endsAt: result.data.endsAt ? result.data.endsAt.toISOString().slice(0, 16) : undefined,
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
    return <div className='text-center text-muted-foreground py-8'>Loading...</div>;
  }

  if (!event) {
    return <div className='text-center text-destructive py-8'>Event not found</div>;
  }

  return (
    <div className='space-y-6'>
      {/* Stats Overview */}
      <div className='grid gap-4 grid-cols-1 sm:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{event.applicationsCount}</div>
            <p className='text-xs text-muted-foreground mt-1'>submitted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{event.questionsCount}</div>
            <p className='text-xs text-muted-foreground mt-1'>active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Capacity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{event.capacity ?? '—'}</div>
            <p className='text-xs text-muted-foreground mt-1'>max attendees</p>
          </CardContent>
        </Card>
      </div>

      {/* Event Settings Card */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle>Event Settings</CardTitle>
              <CardDescription>Configure event details and requirements</CardDescription>
            </div>
            {!isEditing && (
              <Button variant='outline' size='sm' onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!isEditing ? (
            <div className='space-y-4'>
              <div>
                <p className='text-xs font-semibold text-muted-foreground uppercase'>Name</p>
                <p className='text-sm mt-1'>{event.name}</p>
              </div>
              <div>
                <p className='text-xs font-semibold text-muted-foreground uppercase'>
                  Application Form
                </p>
                <p className='text-sm mt-1'>
                  {event.hasApplication ? 'Required' : 'Not required'}
                </p>
              </div>
              {event.startsAt && (
                <div>
                  <p className='text-xs font-semibold text-muted-foreground uppercase'>
                    Starts At
                  </p>
                  <p className='text-sm mt-1'>
                    {new Date(event.startsAt).toLocaleString()}
                  </p>
                </div>
              )}
              {event.endsAt && (
                <div>
                  <p className='text-xs font-semibold text-muted-foreground uppercase'>
                    Ends At
                  </p>
                  <p className='text-sm mt-1'>
                    {new Date(event.endsAt).toLocaleString()}
                  </p>
                </div>
              )}
              <div>
                <p className='text-xs font-semibold text-muted-foreground uppercase'>
                  Featured on Homepage
                </p>
                <p className='text-sm mt-1'>{event.isFeatured ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className='text-xs font-semibold text-muted-foreground uppercase'>
                  Teams
                </p>
                <p className='text-sm mt-1'>
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
                  <Label htmlFor='hasApplication'>Requires application form</Label>
                </div>

                {/* Capacity */}
                <Field>
                  <FieldLabel htmlFor='capacity'>Capacity (optional)</FieldLabel>
                  <FieldDescription>Maximum number of attendees</FieldDescription>
                  <Input
                    id='capacity'
                    type='number'
                    {...register('capacity', {
                      setValueAs: (value) => (value === '' ? undefined : Number(value)),
                    })}
                    placeholder='e.g. 100'
                  />
                  {errors.capacity && <FieldError errors={[errors.capacity]} />}
                </Field>

                {/* Starts At */}
                <Field>
                  <FieldLabel htmlFor='startsAt'>Starts At (optional)</FieldLabel>
                  <Input
                    id='startsAt'
                    type='datetime-local'
                    {...register('startsAt')}
                  />
                  {errors.startsAt && <FieldError errors={[errors.startsAt]} />}
                </Field>

                {/* Ends At */}
                <Field>
                  <FieldLabel htmlFor='endsAt'>Ends At (optional)</FieldLabel>
                  <Input
                    id='endsAt'
                    type='datetime-local'
                    {...register('endsAt')}
                  />
                  {errors.endsAt && <FieldError errors={[errors.endsAt]} />}
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
                  <Label htmlFor='teamsEnabled'>Allow participants to form teams</Label>
                </div>

                {/* Max team size */}
                {teamsEnabled && (
                  <Field>
                    <FieldLabel htmlFor='maxTeamSize'>Max team size (optional)</FieldLabel>
                    <FieldDescription>Leave blank for no cap.</FieldDescription>
                    <Input
                      id='maxTeamSize'
                      type='number'
                      {...register('maxTeamSize', {
                        setValueAs: (value) => (value === '' ? null : Number(value)),
                      })}
                      placeholder='e.g. 4'
                    />
                    {errors.maxTeamSize && <FieldError errors={[errors.maxTeamSize]} />}
                  </Field>
                )}
              </FieldGroup>

              <div className='flex gap-2 justify-end pt-2'>
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
