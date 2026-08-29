'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { authClient } from '@/utils/auth-client';
import { cn } from '@/lib/utils';

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

export function AuthNavButton({ className }: AuthNavButtonProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
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

  return (
    <Button shadow='md' className={className} asChild>
      <Link href='/signin'>
        <AuthButtonLabel>Sign In</AuthButtonLabel>
      </Link>
    </Button>
  );
}
