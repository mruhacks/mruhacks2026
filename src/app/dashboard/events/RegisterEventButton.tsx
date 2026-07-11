'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { registerForEvent } from '@/app/register/actions';

type Props = { eventId: string };

export function RegisterEventButton({ eventId }: Props) {
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

  return (
    <Button onClick={handleClick} disabled={isPending} size='sm'>
      {isPending ? 'Registering…' : 'Register'}
    </Button>
  );
}
