import Link from 'next/link';
import type { VariantProps } from 'class-variance-authority';
import { Button, buttonVariants } from '@/components/ui/button';
import { REGISTRATION_OPEN } from '@/content';

type RegisterButtonProps = {
  registerUrl: string;
  className?: string;
} & VariantProps<typeof buttonVariants>;

/**
 * "Register Now", hidden once registration closes. It never checks the
 * session: a public page that asked for one on every view would keep waking
 * the database, so signed-in users reach their dashboard from the header's
 * "Dashboard" link instead.
 */
export function RegisterButton({ registerUrl, className, ...variants }: RegisterButtonProps) {
  if (!REGISTRATION_OPEN) return null;

  return (
    <Button {...variants} className={className} asChild>
      <Link href={registerUrl}>Register Now</Link>
    </Button>
  );
}
