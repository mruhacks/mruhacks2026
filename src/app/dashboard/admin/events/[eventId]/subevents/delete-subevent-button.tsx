'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

import { deleteSubevent } from '@/app/dashboard/admin/events/subevent-actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Removes a sub-event after confirming what goes with it.
 *
 * The check-in count is in the prompt because the rows cascade away with the
 * event and are not recoverable — "delete Lunch" reads very differently once
 * you know it means discarding 34 recorded arrivals.
 */
export function DeleteSubeventButton({
  eventId,
  subeventId,
  name,
  checkInCount,
}: {
  eventId: string;
  subeventId: string;
  name: string;
  checkInCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    const result = await deleteSubevent(eventId, subeventId);
    setIsDeleting(false);

    if (!result.success) {
      // A button-only action with no field to anchor an inline error to.
      toast.error(result.error);
      return;
    }
    setOpen(false);
    toast.success(`${name} removed`);
  }

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        className='relative shrink-0'
        aria-label={`Delete ${name}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className='size-4' />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              {checkInCount > 0
                ? `This also removes ${checkInCount} check-in${checkInCount === 1 ? '' : 's'} recorded for it. Nobody's main event check-in is affected.`
                : 'It has no check-ins recorded against it.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type='button'
              variant='destructive'
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? 'Deleting...' : 'Delete schedule entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
