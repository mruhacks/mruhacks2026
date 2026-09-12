'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { leaveTeam } from '@/app/dashboard/events/team-actions';

type Props = { eventId: string };

export function LeaveTeamButton({ eventId }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await leaveTeam(eventId);
      if (result.success) {
        toast.success(
          typeof result.data === 'string' ? result.data : 'Left team.',
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      size='sm'
      variant='outline'
    >
      {isPending ? 'Leaving…' : 'Leave team'}
    </Button>
  );
}
