'use client';

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/clipboard';

/**
 * Copies the participant-facing event URL. A toast is right here: this is a
 * button-only action with no input to anchor an inline error to (AGENTS.md).
 */
export function ShareEventButton({ eventId }: { eventId: string }) {
  async function share() {
    const url = `${window.location.origin}/dashboard/events/${eventId}`;
    const copied = await copyToClipboard(url);
    if (copied) toast.success('Event link copied');
    else toast.error('Could not copy the link');
  }

  return (
    <Button variant='outline' size='sm' onClick={share}>
      <Share2 aria-hidden className='size-4' />
      Share
    </Button>
  );
}
