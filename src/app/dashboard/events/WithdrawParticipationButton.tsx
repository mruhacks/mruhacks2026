'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { withdrawParticipation } from '@/app/dashboard/events/actions';
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

type Props = {
  eventId: string;
  /** What's being given up: a confirmed spot, or a place on the waitlist. */
  kind: 'spot' | 'waitlist';
};

/**
 * Lets a participant give up a confirmed spot or leave the waitlist, behind a
 * confirmation — neither can be undone by the participant.
 */
export function WithdrawParticipationButton({ eventId, kind }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const label = kind === 'spot' ? 'Give up my spot' : 'Leave waitlist';

  function confirm() {
    startTransition(async () => {
      const result = await withdrawParticipation(eventId);
      if (result.success) {
        toast.success(
          typeof result.data === 'string' ? result.data : 'Updated.',
        );
        // The action revalidates this page, so the new status renders on
        // its own.
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button
        size='sm'
        variant={kind === 'spot' ? 'destructive' : 'outline'}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}?</DialogTitle>
            <DialogDescription>
              {kind === 'spot'
                ? "Your spot will be offered to someone else. You won't be able to get it back."
                : "You won't be invited if a spot opens up. You can't rejoin the waitlist afterwards."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={confirm}
              disabled={isPending}
            >
              {isPending && <Spinner data-icon='inline-start' />}
              {label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
