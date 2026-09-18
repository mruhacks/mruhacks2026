'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { useRsvpDecision } from '@/app/dashboard/events/use-rsvp-decision';
import curtPointing from '@/assets/crt_pointing.png';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { formatLiveCountdown, toDate } from '@/lib/rsvp/format-remaining';
import { useIsHydrated } from '@/lib/use-is-hydrated';

type Props = {
  eventId: string;
  eventName: string;
  respondBy: Date | string;
};

export function RsvpPendingPrompt({ eventId, eventName, respondBy }: Props) {
  const router = useRouter();
  const hydrated = useIsHydrated();
  const deadline = toDate(respondBy);
  const [now, setNow] = React.useState(() => new Date());
  const [open, setOpen] = React.useState(true);
  const [confirmDecline, setConfirmDecline] = React.useState(false);
  const refreshedOnExpiry = React.useRef(false);
  const { isPending, activeDecision, error, submit } = useRsvpDecision(eventId);

  React.useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [hydrated]);

  const remaining = hydrated ? formatLiveCountdown(deadline, now) : null;
  const expired = hydrated && remaining === null;

  React.useEffect(() => {
    if (!expired || refreshedOnExpiry.current) return;
    refreshedOnExpiry.current = true;
    router.refresh();
  }, [expired, router]);

  if (expired) {
    return null;
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isPending) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setConfirmDecline(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isPending}
        className='max-h-[90vh] w-[calc(100%-1.5rem)] overflow-visible p-8 sm:max-w-3xl sm:p-12'
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        {confirmDecline ? (
          <div className='flex flex-col gap-6 py-4 sm:py-8'>
            <DialogHeader className='text-center sm:text-center'>
              <DialogTitle className='text-2xl sm:text-3xl'>
                Decline your spot?
              </DialogTitle>
              <DialogDescription className='text-base'>
                You will give up your spot and cannot accept this invitation
                later.
              </DialogDescription>
            </DialogHeader>
            {error && <FieldError errors={[{ message: error }]} />}
            <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-center'>
              <Button
                type='button'
                variant='outline'
                disabled={isPending}
                onClick={() => setConfirmDecline(false)}
              >
                Cancel
              </Button>
              <Button
                type='button'
                variant='destructive'
                disabled={isPending}
                onClick={() => submit('declined')}
              >
                {activeDecision === 'declined' && isPending ? (
                  <>
                    <Spinner data-icon='inline-start' />
                    Declining…
                  </>
                ) : (
                  'Decline spot'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className='flex flex-col items-center gap-8 py-2 text-center sm:py-4'>
            <DialogHeader className='items-center text-center'>
              <DialogTitle className='text-2xl tracking-tight sm:text-3xl'>
                Your spot is ready
              </DialogTitle>
              <DialogDescription className='text-center text-base'>
                You&apos;ve been accepted to {eventName}.
              </DialogDescription>
            </DialogHeader>

            <div className='flex flex-col gap-1'>
              <p
                className='text-4xl font-semibold tracking-tight sm:text-5xl'
                aria-live='polite'
              >
                {remaining ?? '—'}
              </p>
              <p className='text-muted-foreground text-sm font-medium'>
                remaining to confirm spot
              </p>
            </div>

            {error && <FieldError errors={[{ message: error }]} />}

            <div className='flex w-full max-w-xs flex-col items-center gap-2'>
              <Button
                type='button'
                variant='purple'
                size='lg'
                className='w-full'
                disabled={isPending}
                onClick={() => submit('accepted')}
              >
                {activeDecision === 'accepted' && isPending ? (
                  <>
                    <Spinner data-icon='inline-start' />
                    Accepting…
                  </>
                ) : (
                  'Accept my spot'
                )}
              </Button>
              <Button
                type='button'
                variant='ghost'
                disabled={isPending}
                onClick={() => setConfirmDecline(true)}
              >
                Decline
              </Button>
            </div>

            <p className='text-muted-foreground max-w-md text-base'>
              If you don&apos;t respond before the deadline, your spot will be
              forfeited.
            </p>
          </div>
        )}
        {!confirmDecline && (
          <Image
            src={curtPointing}
            alt=''
            aria-hidden
            className='pointer-events-none absolute right-0 -bottom-36 hidden h-auto w-md translate-x-[52%] md:block lg:w-xl lg:translate-x-[55%]'
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
