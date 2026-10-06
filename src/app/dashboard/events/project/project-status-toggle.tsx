'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { setSubmissionPublished } from '@/app/dashboard/events/submission-actions';
import { SubmissionStatusBadge } from '@/components/submissions/submission-view';

/**
 * The project panel's Public/Private pill, clickable while submissions are
 * open. The action revalidates the event page, so the rest of the panel
 * (e.g. the "won't be judged" warning) follows on its own.
 */
export function ProjectStatusToggle({
  eventId,
  published,
}: {
  eventId: string;
  published: boolean;
}) {
  const [optimistic, setOptimistic] = React.useOptimistic(published);
  const [isPending, startTransition] = React.useTransition();

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      const result = await setSubmissionPublished(eventId, next);
      if (!result.success) {
        // A button-only action with no field to anchor an inline error to.
        toast.error(result.error);
        return;
      }
      toast.success(next ? 'Project is now public' : 'Project is now private');
    });
  }

  return (
    <SubmissionStatusBadge
      published={optimistic}
      onToggle={toggle}
      disabled={isPending}
    />
  );
}
