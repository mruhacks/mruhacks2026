'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { createEvent } from '@/app/dashboard/admin/events/actions';
import { createEventSchema } from '@/app/dashboard/admin/events/schemas';
import type { CreateEventInput } from '@/app/dashboard/admin/events/schemas';
import { adminEventPath } from '@/lib/event-slug';
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
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
    setSubmitError(null);
    const result = await createEvent(data);
    if (result.success && result.data) {
      toast.success('Event created successfully');
      setOpen(false);
      reset();
      // Navigate to the new event, by the slug it was just given if any.
      router.push(
        adminEventPath({ id: result.data.id, slug: data.slug?.trim() || null }),
      );
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
            Give it a name to get started — everything else (schedule, location,
            capacity, application) can be set up afterward from the event&apos;s
            settings.
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
                autoFocus
              />
              {errors.name && <FieldError errors={[errors.name]} />}
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
