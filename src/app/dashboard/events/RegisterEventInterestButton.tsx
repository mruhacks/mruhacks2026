'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { registerEventInterest } from './actions';

type Props = { eventId: string; hasInterest: boolean };

export function RegisterEventInterestButton({ eventId, hasInterest }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await registerEventInterest(eventId);
      if (result?.success) {
        toast.success('Interest saved.');
        router.refresh();
      } else {
        toast.error(result?.error ?? 'Failed to save interest.');
      }
    });
  }

  return (
    <Button onClick={handleClick} disabled={isPending || hasInterest} size='sm'>
      {hasInterest ? 'Interest saved' : isPending ? 'Saving...' : 'Notify me'}
    </Button>
  );
}
