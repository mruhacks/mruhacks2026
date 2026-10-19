'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { authClient } from '@/utils/auth-client';
import { REGISTRATION_OPEN } from '@/content';
import { cn } from '@/lib/utils';
import { syncSignedInHint } from '@/lib/signed-in-hint';
import { useSignedInHint } from '@/lib/use-signed-in-hint';
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

type ButtonStyleProps = Omit<RegisterOrDashboardButtonProps, 'registerUrl'>;

function PendingRegistrationButton({
  className,
  variant,
  size,
  shadow,
}: ButtonStyleProps) {
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
        <span className='invisible col-start-1 row-start-1'>Register Now</span>
        <Skeleton className='col-start-1 row-start-1 h-[0.7em] w-full bg-current/25' />
      </span>
    </Button>
  );
}

function RegisterButton({
  registerUrl,
  className,
  variant,
  size,
  shadow,
}: RegisterOrDashboardButtonProps) {
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

/** Mounted only when the signed-in hint is present, so only then is the session fetched. */
function SessionRegisterOrDashboardButton(
  props: RegisterOrDashboardButtonProps,
) {
  const { className, variant, size, shadow } = props;
  const { data: session, isPending } = authClient.useSession();

  React.useEffect(() => {
    if (!isPending) syncSignedInHint(session != null);
  }, [isPending, session]);

  if (isPending) return <PendingRegistrationButton {...props} />;

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

  return <RegisterButton {...props} />;
}

/**
 * Renders "Register Now" for signed-out visitors and "Dashboard" for signed-in
 * users, so a returning user is never sent back through registration.
 */
export function RegisterOrDashboardButton(
  props: RegisterOrDashboardButtonProps,
) {
  const signedInHint = useSignedInHint();

  if (signedInHint === null) return <PendingRegistrationButton {...props} />;
  if (!signedInHint) return <RegisterButton {...props} />;
  return <SessionRegisterOrDashboardButton {...props} />;
}
