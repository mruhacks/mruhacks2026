'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { sendEventRsvpWave } from '@/app/dashboard/admin/events/actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Props = {
  eventId: string;
  hasApplication: boolean;
};

/** Admin control to start the next RSVP wave for an application event. */
export function SendRsvpWaveCard({ eventId, hasApplication }: Props) {
  const [respondBy, setRespondBy] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await sendEventRsvpWave(eventId, respondBy);
      if (!result.success) {
        toast.error(result.error || 'Failed to send RSVP wave');
        return;
      }

      const data = result.data;
      const failureNote =
        data.emailFailures.length > 0
          ? ` (${data.emailFailures.length} email failure${data.emailFailures.length === 1 ? '' : 's'})`
          : '';

      toast.success(
        `Wave ${data.waveNumber}: ${data.responsesCreated} invite${data.responsesCreated === 1 ? '' : 's'} created, ${data.emailsSent} email${data.emailsSent === 1 ? '' : 's'} sent${failureNote}.`,
      );
      setRespondBy('');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!hasApplication) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>RSVP Wave</CardTitle>
        <CardDescription>
          Invite eligible accepted applicants to confirm their spot.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <Field>
            <FieldLabel htmlFor='rsvpRespondBy'>RSVP deadline</FieldLabel>
            <FieldDescription>
              Applicants must respond by this date and time in Calgary
              (Mountain Time).
            </FieldDescription>
            <Input
              id='rsvpRespondBy'
              type='datetime-local'
              value={respondBy}
              onChange={(e) => setRespondBy(e.target.value)}
              required
            />
          </Field>
          <div className='flex justify-end'>
            <Button type='submit' disabled={isSubmitting || !respondBy}>
              {isSubmitting ? 'Sending…' : 'Send RSVP Wave'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
