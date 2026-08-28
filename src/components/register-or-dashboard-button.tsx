'use client';

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { authClient } from '@/utils/auth-client';
import { REGISTRATION_OPEN } from '@/content';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

type RegisterOrDashboardButtonProps = {
  registerUrl: string;
  className?: string;
} & VariantProps<typeof buttonVariants>;

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
    // Reserve the space the resolved button will occupy so it doesn't pop in
    // and shift surrounding layout once the session check settles. Sized to
    // "Register Now", the longer of the two possible labels, unless
    // registration is closed — then only "Dashboard" can ever appear.
    return (
      <Button
        variant={variant}
        size={size}
        shadow={shadow}
        className={cn('invisible', className)}
        aria-hidden
        tabIndex={-1}
      >
        {REGISTRATION_OPEN ? 'Register Now' : 'Dashboard'}
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
        <Link href='/dashboard'>Dashboard</Link>
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
      <Link href={registerUrl}>Register Now</Link>
    </Button>
  );
}
