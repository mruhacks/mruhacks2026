'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { registerForEvent } from '@/app/register/actions';

type Props = { eventId: string; className?: string; full?: boolean };

export function RegisterEventButton({ eventId, className, full }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await registerForEvent(eventId);
      if (result?.success) {
        toast.success('Registered for event.');
      } else {
        toast.error(result?.error ?? 'Failed to register.');
      }
    });
  }

  if (full) {
    return (
      <Button className={className} disabled size='sm'>
        Event full
      </Button>
    );
  }

  return (
    <Button
      className={className}
      onClick={handleClick}
      disabled={isPending}
      size='sm'
    >
      {isPending ? 'Registering…' : 'Register'}
    </Button>
  );
}
