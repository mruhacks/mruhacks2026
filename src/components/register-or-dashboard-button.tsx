'use client';

import * as React from 'react';
import Link from 'next/link';
import type { VariantProps } from 'class-variance-authority';
import { Button, buttonVariants } from '@/components/ui/button';
import { authClient } from '@/utils/auth-client';
import { REGISTRATION_OPEN } from '@/content';

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
 * Renders "Register Now" for signed-out visitors and "Dashboard" for signed-in
 * users, so a returning user is never sent back through registration.
 *
 * Renders the signed-out state first (on the server and while the session is
 * loading) and switches to "Dashboard" only once a session resolves, so the
 * common anonymous case never waits on a placeholder.
 */
export function RegisterOrDashboardButton({
  registerUrl,
  className,
  ...variants
}: RegisterOrDashboardButtonProps) {
  const { data: session } = authClient.useSession();
  const signedIn = session != null;

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
