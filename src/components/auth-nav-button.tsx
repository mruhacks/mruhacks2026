'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { authClient } from '@/utils/auth-client';

type AuthNavButtonProps = {
  className?: string;
};

export function AuthNavButton({ className }: AuthNavButtonProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return null;

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
