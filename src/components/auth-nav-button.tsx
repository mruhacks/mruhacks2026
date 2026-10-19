'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { authClient } from '@/utils/auth-client';

type AuthNavButtonProps = {
  className?: string;
};

function AuthButtonLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className='grid place-items-center'>
      <span className='invisible col-start-1 row-start-1' aria-hidden='true'>
        Sign Out
      </span>
      <span className='col-start-1 row-start-1'>{children}</span>
    </span>
  );
}

/**
 * Renders "Sign In" first (on the server and while the session is loading)
 * and switches to "Sign Out" only once a session resolves, so the common
 * anonymous case never waits on a placeholder.
 */
export function AuthNavButton({ className }: AuthNavButtonProps) {
  const { data: session } = authClient.useSession();
  const [isSigningOut, startSignOut] = React.useTransition();

  if (session) {
    return (
      <Button
        type='button'
        shadow='md'
        className={className}
        disabled={isSigningOut}
        onClick={() =>
          startSignOut(async () => {
            await authClient.signOut();
          })
        }
      >
        <AuthButtonLabel>Sign Out</AuthButtonLabel>
      </Button>
    );
  }

  return (
    <Button shadow='md' className={className} asChild>
      <Link href='/signin'>
        <AuthButtonLabel>Sign In</AuthButtonLabel>
      </Link>
    </Button>
  );
}
