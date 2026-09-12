'use client';

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/clipboard';

type Props = { eventId: string; code: string };

export function ShareInviteButton({ eventId, code }: Props) {
  const handleClick = async () => {
    const url = `${window.location.origin}/dashboard/events/${eventId}?joinCode=${code}`;
    if (await copyToClipboard(url)) {
      toast.success('Invite link copied');
    } else {
      toast.error(`Couldn't copy — share this code instead: ${code}`);
    }
  };

  return (
    <Button type='button' size='sm' variant='outline' onClick={handleClick}>
      <Share2 className='size-4' />
      Share
    </Button>
  );
}
