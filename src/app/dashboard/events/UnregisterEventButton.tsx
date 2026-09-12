'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { unregisterFromEvent } from '@/app/register/actions';

type Props = { eventId: string; className?: string };

export function UnregisterEventButton({ eventId, className }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await unregisterFromEvent(eventId);
      if (result?.success) {
        toast.success('Unregistered from event.');
      } else {
        toast.error(result?.error ?? 'Failed to unregister.');
      }
    });
  }

  return (
    <Button
      className={className}
      onClick={handleClick}
      disabled={isPending}
      size='sm'
      variant='outline'
    >
      {isPending ? 'Unregistering…' : 'Unregister'}
    </Button>
  );
}
