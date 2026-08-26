'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { createEvent } from '@/app/dashboard/admin/events/actions';
import { createEventSchema } from '@/app/dashboard/admin/events/schemas';
import type { CreateEventInput } from '@/app/dashboard/admin/events/schemas';
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
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateEventInput>({
    resolver: zodResolver(createEventSchema) as Resolver<CreateEventInput>,
    defaultValues: {
      name: '',
      hasApplication: false,
    },
  });

  const onSubmit = async (data: CreateEventInput) => {
    const result = await createEvent(data);
    if (result.success && result.data) {
      toast.success('Event created successfully');
      setOpen(false);
      reset();
      // Navigate to the new event
      router.push(`/dashboard/admin/events/${result.data.id}?tab=overview`);
    } else if (!result.success) {
      toast.error(result.error || 'Failed to create event');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
                  setValueAs: (value) =>
                    value === '' ? undefined : Number(value),
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
          </FieldGroup>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setOpen(false);
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
