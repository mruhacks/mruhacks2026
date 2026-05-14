'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type DeleteQuestionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionLabel: string;
  hasApplications: boolean;
  onConfirm: () => void;
  isLoading?: boolean;
};

export function DeleteQuestionDialog({
  open,
  onOpenChange,
  questionLabel,
  hasApplications,
  onConfirm,
  isLoading,
}: DeleteQuestionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {hasApplications ? 'Hide question' : 'Delete question'}
          </DialogTitle>
          <DialogDescription>
            {hasApplications ? (
              <>
                Applications already exist for this event. The question{' '}
                <strong>&quot;{questionLabel}&quot;</strong> will be hidden from
                new applicants but existing responses will be preserved.
              </>
            ) : (
              <>
                Are you sure you want to delete{' '}
                <strong>&quot;{questionLabel}&quot;</strong>? This cannot be
                undone.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            onClick={onConfirm}
            disabled={isLoading}
          >
            {hasApplications ? 'Hide' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
