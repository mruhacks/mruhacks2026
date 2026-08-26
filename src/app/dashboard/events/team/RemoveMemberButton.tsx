'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { removeMember } from '@/app/dashboard/events/team-actions';

type Props = { eventId: string; targetUserId: string };

export function RemoveMemberButton({ eventId, targetUserId }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await removeMember(eventId, targetUserId);
      if (result.success) {
        toast.success(
          typeof result.data === 'string' ? result.data : 'Member removed.',
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
      size='icon'
      variant='ghost'
      aria-label='Remove member'
    >
      <UserMinus className='size-4' />
    </Button>
  );
}
