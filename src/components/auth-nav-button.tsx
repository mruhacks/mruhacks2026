'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { authClient } from '@/utils/auth-client';
import { cn } from '@/lib/utils';

type AuthNavButtonProps = {
  className?: string;
};

export function AuthNavButton({ className }: AuthNavButtonProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    // Reserve the space "Sign Out" (the longer of the two labels) occupies so
    // this doesn't pop in and shift surrounding layout once the session check
    // settles.
    return (
      <Button
        shadow='md'
        className={cn('invisible', className)}
        aria-hidden
        tabIndex={-1}
      >
        Sign Out
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
        Sign Out
      </Button>
    );
  }

  return (
    <Button shadow='md' className={className} asChild>
      <Link href='/signin'>Sign In</Link>
    </Button>
  );
}
