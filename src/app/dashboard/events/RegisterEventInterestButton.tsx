'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { registerEventInterest } from './actions';

type Props = { eventId: string; userHasRegisteredInterest: boolean };

export function RegisterEventInterestButton({
  eventId,
  userHasRegisteredInterest,
}: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await registerEventInterest(eventId);
      if (result?.success) {
        toast.success('Interest saved.');
      } else {
        toast.error(result?.error ?? 'Failed to save interest.');
      }
    });
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isPending || userHasRegisteredInterest}
      size='sm'
    >
      {userHasRegisteredInterest
        ? 'Interest saved'
        : isPending
          ? 'Saving...'
          : 'Notify me'}
    </Button>
  );
}
