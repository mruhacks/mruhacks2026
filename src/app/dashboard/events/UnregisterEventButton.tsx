'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { unregisterFromEvent } from '@/app/register/actions';
import {
  REGISTER_EMAIL_NOT_VERIFIED_MESSAGE,
  REGISTER_NEEDS_PROFILE_MESSAGE,
} from '@/app/register/messages';

const EVENTS_PATH = '/dashboard/events';

type Props = { eventId: string };

export function UnregisterEventButton({ eventId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await unregisterFromEvent(eventId);
      if (result?.success) {
        toast.success('Unregistered from event.');
        router.refresh();
        return;
      }
      const err = result?.error ?? 'Failed to unregister.';
      if (err === REGISTER_NEEDS_PROFILE_MESSAGE) {
        toast.info('Complete your profile first.');
        router.push(
          `/dashboard/profile?next=${encodeURIComponent(EVENTS_PATH)}`,
        );
        return;
      }
      if (err === REGISTER_EMAIL_NOT_VERIFIED_MESSAGE) {
        router.push('/verify-email');
        return;
      }
      toast.error(err);
    });
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      size='sm'
      variant='outline'
    >
      {isPending ? 'Unregistering…' : 'Unregister'}
    </Button>
  );
}
