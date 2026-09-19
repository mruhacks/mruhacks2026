'use client';

import { useState } from 'react';

import { useRsvpDecision } from '@/app/dashboard/events/use-rsvp-decision';
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
import { Spinner } from '@/components/ui/spinner';

type Props = {
  eventId: string;
};

/**
 * Accept / Decline controls for a pending RSVP invitation.
 */
export function RsvpResponseButtons({ eventId }: Props) {
  const { isPending, activeDecision, error, submit } = useRsvpDecision(eventId);
  const [confirmDecline, setConfirmDecline] = useState(false);

  return (
    <div className='flex flex-col gap-3'>
      {error && <FieldError errors={[{ message: error }]} />}
      <div className='flex flex-wrap gap-3'>
        <Button
          onClick={() => submit('accepted')}
          disabled={isPending}
          variant='purple'
          size='lg'
        >
          {activeDecision === 'accepted' && isPending ? (
            <>
              <Spinner data-icon='inline-start' />
              Accepting…
            </>
          ) : (
            'Accept my spot'
          )}
        </Button>
        <Button
          onClick={() => setConfirmDecline(true)}
          disabled={isPending}
          variant='outline'
          size='lg'
        >
          Decline
        </Button>
      </div>

      <Dialog
        open={confirmDecline}
        onOpenChange={(open) => {
          if (!open && isPending) return;
          setConfirmDecline(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline your spot?</DialogTitle>
            <DialogDescription>
              You will give up your spot and cannot accept this invitation
              later.
            </DialogDescription>
          </DialogHeader>
          {error && <FieldError errors={[{ message: error }]} />}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setConfirmDecline(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => submit('declined')}
              disabled={isPending}
            >
              {activeDecision === 'declined' && isPending ? (
                <>
                  <Spinner data-icon='inline-start' />
                  Declining…
                </>
              ) : (
                'Decline spot'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
