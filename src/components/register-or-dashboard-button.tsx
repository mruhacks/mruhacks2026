'use client';

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { authClient } from '@/utils/auth-client';
import { REGISTRATION_OPEN } from '@/content';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

type RegisterOrDashboardButtonProps = {
  registerUrl: string;
  className?: string;
} & VariantProps<typeof buttonVariants>;

function RegistrationButtonLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className='grid place-items-center'>
      <span className='invisible col-start-1 row-start-1' aria-hidden='true'>
        Register Now
      </span>
      <span className='col-start-1 row-start-1'>{children}</span>
    </span>
  );
}

/**
 * Renders "Register Now" for signed-out visitors and "Dashboard" for signed-in
 * users, so a returning user is never sent back through registration.
 */
export function RegisterOrDashboardButton({
  registerUrl,
  className,
  variant,
  size,
  shadow,
}: RegisterOrDashboardButtonProps) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <Button
        type='button'
        variant={variant}
        size={size}
        shadow={shadow}
        className={cn('pointer-events-none', className)}
        aria-disabled='true'
        tabIndex={-1}
      >
        <span className='grid place-items-center' aria-hidden='true'>
          <span className='invisible col-start-1 row-start-1'>
            Register Now
          </span>
          <Skeleton className='col-start-1 row-start-1 h-[0.7em] w-full bg-current/25' />
        </span>
      </Button>
    );
  }

  if (session) {
    return (
      <Button
        variant={variant}
        size={size}
        shadow={shadow}
        className={className}
        asChild
      >
        <Link href='/dashboard'>
          <RegistrationButtonLabel>Dashboard</RegistrationButtonLabel>
        </Link>
      </Button>
    );
  }

  if (!REGISTRATION_OPEN) return null;

  return (
    <Button
      variant={variant}
      size={size}
      shadow={shadow}
      className={className}
      asChild
    >
      <Link href={registerUrl}>
        <RegistrationButtonLabel>Register Now</RegistrationButtonLabel>
      </Link>
    </Button>
  );
}
