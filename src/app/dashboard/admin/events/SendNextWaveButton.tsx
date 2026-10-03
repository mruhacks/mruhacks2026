'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { sendEventRsvpWave } from '@/app/dashboard/admin/events/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';

type Props = {
  eventId: string;
  nextWaveNumber: number;
  /** No wave has gone out yet. The scheduler only sends follow-ups. */
  isFirstWave: boolean;
  /** How many the wave will invite, for the confirmation copy. */
  inviteCount: number;
  rsvpResponseWindowHours: number;
  /** The wave still open right now, if any. Sending closes it early. */
  openWave: { wave: number; waitingCount: number } | null;
  /** Viewer holds `rsvp:write:all`, which closing an open wave needs. */
  canCloseOpenWave: boolean;
  disabled?: boolean;
  onWaveSent: () => void;
};

/**
 * Sends the next RSVP wave now. While a wave is still open, sending closes it
 * first: its unanswered invitations time out, then the new wave fills every
 * open spot from the top of the waitlist.
 */
export function SendNextWaveButton({
  eventId,
  nextWaveNumber,
  isFirstWave,
  inviteCount,
  rsvpResponseWindowHours,
  openWave,
  canCloseOpenWave,
  disabled = false,
  onWaveSent,
}: Props) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hours = `${rsvpResponseWindowHours} hour${rsvpResponseWindowHours === 1 ? '' : 's'}`;
  const blocked = openWave !== null && !canCloseOpenWave;

  async function handleConfirm() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await sendEventRsvpWave(eventId, {
        closeActiveWave: openWave !== null,
      });
      if (!result.success || !result.data) {
        setError(
          (!result.success && result.error) || 'Failed to send RSVP wave',
        );
        return;
      }
      const data = result.data;
      const closedNote = data.closedWave
        ? `Wave ${data.closedWave.wave} closed (${data.closedWave.timedOutCount} timed out). `
        : '';
      const failureNote =
        data.queueFailures.length > 0
          ? ` (${data.queueFailures.length} queue failure${data.queueFailures.length === 1 ? '' : 's'})`
          : '';
      toast.success(
        `${closedNote}Wave ${data.waveNumber} sent, ${data.invitationsQueued} invitation${data.invitationsQueued === 1 ? '' : 's'} queued${failureNote}.`,
      );
      setConfirmOpen(false);
      onWaveSent();
    } catch {
      setError('Failed to send RSVP wave');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className='flex flex-col items-end gap-1'>
      <Button
        type='button'
        size='sm'
        disabled={disabled || blocked || isSubmitting}
        title={
          blocked
            ? 'Closing an open wave early needs the RSVP management permission.'
            : undefined
        }
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
      >
        {openWave
          ? `Close wave ${openWave.wave} and send`
          : isFirstWave
            ? 'Start waves'
            : 'Send now'}
      </Button>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && isSubmitting) return;
          setConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {openWave
                ? `Close wave ${openWave.wave} and send wave ${nextWaveNumber}?`
                : isFirstWave
                  ? 'Start RSVP waves?'
                  : `Send wave ${nextWaveNumber}?`}
            </DialogTitle>
            <DialogDescription>
              {openWave
                ? `The ${openWave.waitingCount} ${openWave.waitingCount === 1 ? 'person' : 'people'} in wave ${openWave.wave} who haven't answered lose their invitation now. `
                : ''}
              Up to {inviteCount} {inviteCount === 1 ? 'person' : 'people'} from
              the top of the waitlist will be invited and must respond within{' '}
              {hours}. This cannot be undone.
              {isFirstWave &&
                ' Once this wave ends, the next ones go out automatically as spots open up.'}
            </DialogDescription>
          </DialogHeader>
          {error && <FieldError errors={[{ message: error }]} />}
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
              {isSubmitting ? 'Sending…' : 'Send wave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
