'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { createSubmission } from '@/app/dashboard/events/submission-actions';
import { Button } from '@/components/ui/button';

/**
 * Creates the team's draft. The action revalidates this page, which then
 * renders the editor in place of this button.
 */
export function StartProjectButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = React.useTransition();

  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await createSubmission(eventId);
          // A button-only action with no field to anchor an inline error to.
          if (!result.success) toast.error(result.error);
        })
      }
    >
      {isPending ? 'Starting…' : 'Start project'}
    </Button>
  );
}
