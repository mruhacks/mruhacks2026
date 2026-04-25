'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { registerEventInterest } from './actions';

type Props = { eventId: string; userHasRegisteredInterest: boolean };

export function RegisterEventInterestButton({
  eventId,
  userHasRegisteredInterest,
}: Props) {
  const [saved, setSaved] = useState(userHasRegisteredInterest);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSaved(userHasRegisteredInterest);
  }, [userHasRegisteredInterest]);

  function handleClick() {
    startTransition(async () => {
      const result = await registerEventInterest(eventId);
      if (result?.success) {
        toast.success('Interest saved.');
        // removed refresh
        setSaved(true);
      } else {
        toast.error(result?.error ?? 'Failed to save interest.');
      }
    });
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isPending || saved}
      size='sm'
    >
      {saved
        ? 'Interest saved'
        : isPending
          ? 'Saving...'
          : 'Notify me'}
    </Button>
  );
}
