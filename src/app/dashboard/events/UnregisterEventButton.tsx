'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { unregisterFromEvent } from '@/app/register/actions';

type Props = {
  eventId: string;
  /**
   * Registration no longer takes newcomers. Unregistering deletes the
   * participant row, so the user couldn't sign back up — confirm first.
   */
  registrationClosed?: boolean;
  className?: string;
};

export function UnregisterEventButton({
  eventId,
  registrationClosed = false,
  className,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function unregister() {
    startTransition(async () => {
      const result = await unregisterFromEvent(eventId);
      if (result?.success) {
        toast.success('Unregistered from event.');
        setConfirming(false);
      } else {
        toast.error(result?.error ?? 'Failed to unregister.');
      }
    });
  }

  return (
    <>
      <Button
        className={className}
        onClick={registrationClosed ? () => setConfirming(true) : unregister}
        disabled={isPending}
        size='sm'
        variant='outline'
      >
        {isPending ? 'Unregistering…' : 'Unregister'}
      </Button>
      {registrationClosed && (
        <Dialog
          open={confirming}
          onOpenChange={(next) => !isPending && setConfirming(next)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Unregister?</DialogTitle>
              <DialogDescription>
                Registration for this event is closed. If you unregister, you
                won&apos;t be able to register again.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setConfirming(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant='destructive'
                onClick={unregister}
                disabled={isPending}
              >
                {isPending && <Spinner data-icon='inline-start' />}
                Unregister
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
