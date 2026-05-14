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
  questionType?: string;
  hasApplications: boolean;
  onConfirm: () => void;
  isLoading?: boolean;
};

export function DeleteQuestionDialog({
  open,
  onOpenChange,
  questionLabel,
  questionType,
  hasApplications,
  onConfirm,
  isLoading,
}: DeleteQuestionDialogProps) {
  // Section dividers can always be hard-deleted
  const isSectionDivider = questionType === 'section_divider';
  const canHardDelete = isSectionDivider || !hasApplications;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {canHardDelete ? 'Delete question' : 'Hide question'}
          </DialogTitle>
          <DialogDescription>
            {canHardDelete ? (
              <>
                Are you sure you want to delete{' '}
                <strong>&quot;{questionLabel}&quot;</strong>? This cannot be
                undone.
              </>
            ) : (
              <>
                Applications already exist for this event. The question{' '}
                <strong>&quot;{questionLabel}&quot;</strong> will be hidden from
                new applicants but existing responses will be preserved.
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
            {canHardDelete ? 'Delete' : 'Hide'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
