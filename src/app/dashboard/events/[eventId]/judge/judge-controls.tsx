'use client';

/**
 * The few interactive pieces of the judge screen. Everything else is
 * server-rendered: these submit forms to the judge actions, which refresh
 * the page with wherever the judge goes next.
 */

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import { BIG, SKIP } from './judge-styles';

type FormAction = (formData: FormData) => Promise<{ success: boolean; error?: string }>;

const OFFLINE = 'Couldn’t reach the server. Check your connection.';

/**
 * A form for one of the judge actions. Its controls are disabled while it's
 * submitting, and a failure shows under it until the judge changes anything.
 */
export function ActionForm({
  action,
  onSuccess,
  className,
  children,
}: {
  action: FormAction;
  onSuccess?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [error, setError] = React.useState<string>();
  return (
    <form
      className={className}
      onChange={() => setError(undefined)}
      action={async (formData) => {
        setError(undefined);
        try {
          const result = await action(formData);
          if (!result.success) return setError(result.error);
          onSuccess?.();
          window.scrollTo({ top: 0 });
        } catch {
          setError(OFFLINE);
        }
      }}
    >
      <PendingFieldset>{children}</PendingFieldset>
      {error && <FieldError className='mt-2 text-center'>{error}</FieldError>}
    </form>
  );
}

function PendingFieldset({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <fieldset disabled={pending} className='contents'>
      {children}
    </fieldset>
  );
}

/** Shows a spinner in place of `icon` while its form submits. */
export function SubmitButton({
  icon,
  iconEnd,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'type'> & {
  icon?: React.ReactNode;
  iconEnd?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type='submit' className={className} {...props}>
      {pending ? <Spinner /> : icon}
      {children}
      {!pending && iconEnd}
    </Button>
  );
}

/** Asks why before skipping: not here may come back, a conflict won't. */
export function SkipButton({ action, currentId }: { action: FormAction; currentId: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type='button' className={cn(BIG, SKIP)} onClick={() => setOpen(true)}>
        <X />
        Skip
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why are you skipping it?</DialogTitle>
            <DialogDescription>
              If the team isn&apos;t here you may be sent back later. A conflict of interest means you won&apos;t see
              this project again.
            </DialogDescription>
          </DialogHeader>
          <ActionForm action={action} onSuccess={() => setOpen(false)} className='flex flex-col gap-2'>
            <input type='hidden' name='currentId' value={currentId} />
            <SubmitButton name='reason' value='not_here' className={cn(BIG, SKIP)}>
              Team not here
            </SubmitButton>
            <SubmitButton name='reason' value='conflict' className={cn(BIG, SKIP)}>
              Conflict of interest
            </SubmitButton>
            <Button type='button' variant='ghost' size='lg' onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** While there's nothing to do yet, check back this often. */
const IDLE_POLL_MS = 30_000;

/**
 * Re-renders the page on a timer while there's nothing to do (not open yet,
 * no criteria, no projects left), so the judge doesn't have to keep reloading.
 */
export function AutoRefresh() {
  const router = useRouter();
  React.useEffect(() => {
    const id = window.setInterval(() => {
      // The judge screen is rendered by Server Components, not a React Query
      // cache.
      // eslint-disable-next-line custom/no-router-refresh
      if (document.visibilityState === 'visible') router.refresh();
    }, IDLE_POLL_MS);
    return () => window.clearInterval(id);
  }, [router]);
  return null;
}
