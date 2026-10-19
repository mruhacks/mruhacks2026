'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { authClient } from '@/utils/auth-client';
import { cn } from '@/lib/utils';
import { syncSignedInHint } from '@/lib/signed-in-hint';
import { useSignedInHint } from '@/lib/use-signed-in-hint';

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

function PendingAuthButton({ className }: AuthNavButtonProps) {
  return (
    <Button
      type='button'
      shadow='md'
      className={cn('pointer-events-none', className)}
      aria-disabled='true'
      tabIndex={-1}
    >
      <span className='grid place-items-center' aria-hidden='true'>
        <span className='invisible col-start-1 row-start-1'>Sign Out</span>
        <Skeleton className='col-start-1 row-start-1 h-[0.7em] w-full bg-current/25' />
      </span>
    </Button>
  );
}

function SignInButton({ className }: AuthNavButtonProps) {
  return (
    <Button shadow='md' className={className} asChild>
      <Link href='/signin'>
        <AuthButtonLabel>Sign In</AuthButtonLabel>
      </Link>
    </Button>
  );
}

/** Mounted only when the signed-in hint is present, so only then is the session fetched. */
function SessionAuthNavButton({ className }: AuthNavButtonProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  React.useEffect(() => {
    if (!isPending) syncSignedInHint(session != null);
  }, [isPending, session]);

  if (isPending) return <PendingAuthButton className={className} />;

  if (session) {
    return (
      <Button
        type='button'
        shadow='md'
        className={className}
        onClick={async () => {
          await authClient.signOut();
          router.push('/');
        }}
      >
        <AuthButtonLabel>Sign Out</AuthButtonLabel>
      </Button>
    );
  }

  return <SignInButton className={className} />;
}

export function AuthNavButton({ className }: AuthNavButtonProps) {
  const signedInHint = useSignedInHint();

  if (signedInHint === null) return <PendingAuthButton className={className} />;
  if (!signedInHint) return <SignInButton className={className} />;
  return <SessionAuthNavButton className={className} />;
}
