'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { createCampaign } from '../actions';
import type * as Campaigns from '@/lib/campaigns';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Props = {
  /** Top-level events an operational campaign can be about. */
  events: { id: string; name: string }[];
  /** `campaign:operational:all` — without it only marketing is offered. */
  canSendOperational: boolean;
};

export function NewCampaignDialog({ events, canSendOperational }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<Campaigns.Type>('marketing');
  const [eventId, setEventId] = React.useState<string>('none');
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function reset() {
    setName('');
    setType('marketing');
    setEventId('none');
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await createCampaign({
      name,
      type,
      eventId: eventId === 'none' ? null : eventId,
    });
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
    router.push(`/dashboard/admin/campaigns/${result.data!.id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <Plus className='mr-2 size-4' />
        New campaign
      </Button>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>You&apos;ll write the email and pick its audience next.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <FieldGroup className='gap-4'>
            <Field>
              <FieldLabel htmlFor='campaign-name'>Name</FieldLabel>
              <Input
                id='campaign-name'
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder='e.g. MRUHacks 2026 applications open'
                autoFocus
              />
              <FieldDescription>Only organizers see this.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor='campaign-type'>Type</FieldLabel>
              <Select
                value={type}
                onValueChange={(next) => {
                  setType(next as Campaigns.Type);
                  setError(null);
                }}
              >
                <SelectTrigger id='campaign-type' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='marketing'>Marketing</SelectItem>
                  {canSendOperational && <SelectItem value='operational'>Operational</SelectItem>}
                </SelectContent>
              </Select>
              <FieldDescription>
                {type === 'marketing'
                  ? 'Only reaches people who opted into marketing email, and always carries an unsubscribe link.'
                  : 'Logistics for one event’s participants. Skips the marketing opt-in, so keep it to what they need to know.'}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor='campaign-event'>Event{type === 'marketing' && ' (optional)'}</FieldLabel>
              <Select
                value={eventId}
                onValueChange={(next) => {
                  setEventId(next);
                  setError(null);
                }}
              >
                <SelectTrigger id='campaign-event' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {type === 'marketing' && <SelectItem value='none'>No event</SelectItem>}
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          {error && <FieldError>{error}</FieldError>}

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type='submit' disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
