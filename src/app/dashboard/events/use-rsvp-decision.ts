'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { submitRsvpResponse } from '@/app/dashboard/events/actions';
import type { RsvpUserDecision } from '@/lib/rsvp/constants';

export function useRsvpDecision(eventId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeDecision, setActiveDecision] = useState<RsvpUserDecision | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  function submit(decision: RsvpUserDecision) {
    if (isPending) return;

    setError(null);
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
        return;
      }

      setError(result.error);
      setActiveDecision(null);
    });
  }

  return {
    isPending,
    activeDecision,
    error,
    submit,
  };
}
