'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

import { adminDeleteSubmission } from '@/app/dashboard/events/submission-actions';
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
 * Moderation takedown (`submission:delete:all`). Works at any time, deadline
 * or not, and is audit-logged by the action.
 */
export function AdminDeleteSubmissionButton({
  eventId,
  submissionId,
  title,
  backHref,
}: {
  eventId: string;
  submissionId: string;
  title: string;
  backHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    const result = await adminDeleteSubmission(eventId, submissionId);
    setIsDeleting(false);
    if (!result.success) {
      // A button-only action with no field to anchor an inline error to.
      toast.error(result.error);
      return;
    }
    setOpen(false);
    toast.success('Submission deleted');
    router.replace(backHref);
  }

  return (
    <>
      <Button
        type='button'
        variant='outline'
        size='icon'
        aria-label='Delete submission'
        title='Delete submission'
        className='bg-background/80 hover:text-destructive backdrop-blur-sm'
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{title}&rdquo;?</DialogTitle>
            <DialogDescription>
              This removes the team&apos;s write-up, links and images for
              everyone, and can&apos;t be undone. The team can start a new
              project only while submissions are still open.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Delete submission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
