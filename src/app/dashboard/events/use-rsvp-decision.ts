'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { unstable_rethrow, useRouter } from 'next/navigation';

import { submitRsvpResponse } from '@/app/dashboard/events/actions';
import type { RsvpUserDecision } from '@/lib/rsvp/constants';

export function useRsvpDecision(eventId: string, termsId: string | null) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeDecision, setActiveDecision] = useState<RsvpUserDecision | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const [acceptedTermsId, setAcceptedTermsId] = useState<string | null>(null);
  const termsAccepted = !!termsId && acceptedTermsId === termsId;
  const canAccept = !termsId || termsAccepted;
  function setTermsAccepted(accepted: boolean) {
    setAcceptedTermsId(accepted ? termsId : null);
    setError(null);
  }

  function submit(decision: RsvpUserDecision) {
    if (isPending) return;
    if (decision === 'accepted' && !canAccept) {
      setError('You must agree to the Event Terms before accepting your spot.');
      return;
    }

    setError(null);
    setActiveDecision(decision);
    startTransition(async () => {
      try {
        const result = await submitRsvpResponse(eventId, decision, {
          accepted: termsAccepted,
          termsId,
        });
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
      } catch (error) {
        unstable_rethrow(error);
        setError('Unable to submit your RSVP. Please try again.');
        setActiveDecision(null);
      }
    });
  }

  return {
    isPending,
    termsAccepted,
    setTermsAccepted,
    canAccept,
    clearError: () => setError(null),
    activeDecision,
    error,
    submit,
  };
}
