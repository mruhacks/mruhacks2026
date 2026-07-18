'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { submitRsvpResponse } from '@/app/dashboard/events/actions';

type Props = {
  eventId: string;
};

/**
 * Accept / Decline controls for a pending RSVP invitation.
 */
export function RsvpResponseButtons({ eventId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeDecision, setActiveDecision] = useState<
    'accepted' | 'declined' | null
  >(null);

  function handleDecision(decision: 'accepted' | 'declined') {
    if (isPending) return;

    setActiveDecision(decision);
    startTransition(async () => {
      const result = await submitRsvpResponse(eventId, decision);
      if (result.success) {
        toast.success(
          typeof result.data === 'string'
            ? result.data
            : decision === 'accepted'
              ? 'RSVP accepted.'
              : 'RSVP declined.',
        );
        router.refresh();
      } else {
        toast.error(result.error);
        setActiveDecision(null);
      }
    });
  }

  return (
    <div className='flex flex-wrap gap-3'>
      <Button
        onClick={() => handleDecision('accepted')}
        disabled={isPending}
        size='lg'
      >
        {activeDecision === 'accepted' && isPending
          ? 'Accepting…'
          : 'Accept my spot'}
      </Button>
      <Button
        onClick={() => handleDecision('declined')}
        disabled={isPending}
        variant='outline'
        size='lg'
      >
        {activeDecision === 'declined' && isPending ? 'Declining…' : 'Decline'}
      </Button>
    </div>
  );
}
