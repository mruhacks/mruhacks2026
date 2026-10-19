'use client';

import * as React from 'react';
import Link from 'next/link';
import type { VariantProps } from 'class-variance-authority';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { authClient } from '@/utils/auth-client';
import { REGISTRATION_OPEN } from '@/content';
import { cn } from '@/lib/utils';
import { syncSignedInHint } from '@/lib/signed-in-hint';
import { useSignedInHint } from '@/lib/use-signed-in-hint';

type RegisterOrDashboardButtonProps = {
  registerUrl: string;
  className?: string;
} & VariantProps<typeof buttonVariants>;

/** Reserves the width of the widest label so swapping states never shifts layout. */
function FixedWidthLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className='grid place-items-center'>
      <span className='invisible col-start-1 row-start-1' aria-hidden='true'>
        Register Now
      </span>
      <span className='col-start-1 row-start-1 flex w-full justify-center'>
        {children}
      </span>
    </span>
  );
}

/**
 * `signedIn` is null while unknown, rendering a same-sized placeholder.
 * Signed-out visitors get nothing once registration closes.
 */
function ResolvedButton({
  signedIn,
  registerUrl,
  className,
  ...variants
}: RegisterOrDashboardButtonProps & { signedIn: boolean | null }) {
  if (signedIn === null) {
    return (
      <span
        className={cn(
          buttonVariants(variants),
          'pointer-events-none',
          className,
        )}
        aria-hidden='true'
      >
        <FixedWidthLabel>
          <Skeleton className='h-[0.7em] w-full bg-current/25' />
        </FixedWidthLabel>
      </span>
    );
  }

  if (!signedIn && !REGISTRATION_OPEN) return null;

  return (
    <Button {...variants} className={className} asChild>
      <Link href={signedIn ? '/dashboard' : registerUrl}>
        <FixedWidthLabel>
          {signedIn ? 'Dashboard' : 'Register Now'}
        </FixedWidthLabel>
      </Link>
    </Button>
  );
}

/** Mounted only when the signed-in hint is present, so only then is the session fetched. */
function SessionButton(props: RegisterOrDashboardButtonProps) {
  const { data: session, isPending } = authClient.useSession();

  React.useEffect(() => {
    if (!isPending) syncSignedInHint(session != null);
  }, [isPending, session]);

  return (
    <ResolvedButton {...props} signedIn={isPending ? null : session != null} />
  );
}

/**
 * Renders "Register Now" for signed-out visitors and "Dashboard" for signed-in
 * users, so a returning user is never sent back through registration.
 */
export function RegisterOrDashboardButton(
  props: RegisterOrDashboardButtonProps,
) {
  const signedInHint = useSignedInHint();

  if (signedInHint) return <SessionButton {...props} />;
  return <ResolvedButton {...props} signedIn={signedInHint} />;
}
