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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

type Props = {
  eventId: string;
  hasApplication: boolean;
  rsvpResponseWindowHours: number;
};

/** Admin control to start the next RSVP wave for an application event. */
export function SendRsvpWaveCard({
  eventId,
  hasApplication,
  rsvpResponseWindowHours,
}: Props) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await sendEventRsvpWave(eventId);
      if (!result.success) {
        setSubmitError(result.error || 'Failed to send RSVP wave');
        setConfirmOpen(false);
        return;
      }
      if (!result.data) {
        setSubmitError('Failed to send RSVP wave');
        setConfirmOpen(false);
        return;
      }

      const data = result.data;
      const failureNote =
        data.queueFailures.length > 0
          ? ` (${data.queueFailures.length} queue failure${data.queueFailures.length === 1 ? '' : 's'})`
          : '';

      toast.success(
        `Wave ${data.waveNumber} created, ${data.invitationsQueued} invitation${data.invitationsQueued === 1 ? '' : 's'} queued${failureNote}.`,
      );
      setConfirmOpen(false);
    } catch {
      setSubmitError('Failed to send RSVP wave');
      setConfirmOpen(false);
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
          Invite eligible accepted applicants to confirm their spot. They will
          have {rsvpResponseWindowHours} hour
          {rsvpResponseWindowHours === 1 ? '' : 's'} to respond.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
          <Field>
            <FieldDescription>
              The response window is configured in Event Settings. Changing it
              applies to the next wave, not an already-active one.
            </FieldDescription>
            {submitError && <FieldError errors={[{ message: submitError }]} />}
          </Field>
          <div className='flex justify-end'>
            <Button type='submit' disabled={isSubmitting}>
              Send RSVP Wave
            </Button>
          </div>
        </form>
      </CardContent>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && isSubmitting) return;
          setConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send RSVP wave?</DialogTitle>
            <DialogDescription>
              This will invite eligible accepted applicants to confirm their
              spot. They must respond within {rsvpResponseWindowHours} hour
              {rsvpResponseWindowHours === 1 ? '' : 's'}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setConfirmOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type='button'
              onClick={handleConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
