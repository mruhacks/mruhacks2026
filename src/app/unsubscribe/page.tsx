import { Suspense } from 'react';
import Link from 'next/link';
import { MailX } from 'lucide-react';

import { verifyUnsubscribeToken } from '@/lib/signing/email-tokens';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UnsubscribeForm } from './unsubscribe-form';

type Props = { searchParams: Promise<{ t?: string | string[] }> };

/**
 * Where a marketing email's footer link lands. Public — no sign-in — and a
 * plain visit changes nothing: unsubscribing takes the button's POST, so a
 * mail scanner that opens every link can't unsubscribe anyone.
 */
export default function UnsubscribePage({ searchParams }: Props) {
  return (
    <div className='bg-muted/40 flex min-h-screen items-center justify-center p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader className='flex flex-row items-center gap-2'>
          <MailX className='text-muted-foreground size-5' />
          <CardTitle>Email preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className='bg-muted h-24 animate-pulse rounded-md' />
            }
          >
            <UnsubscribeContent searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function UnsubscribeContent({ searchParams }: Props) {
  const { t } = await searchParams;
  const token = typeof t === 'string' ? t : '';
  const claims = token ? await verifyUnsubscribeToken(token) : null;

  if (!claims) {
    return (
      <p className='text-muted-foreground text-sm'>
        This unsubscribe link isn&apos;t valid. You can manage email preferences
        from{' '}
        <Link href='/dashboard/account' className='underline'>
          your account
        </Link>
        .
      </p>
    );
  }

  return (
    <div className='space-y-4'>
      <p className='text-sm'>
        <span className='text-muted-foreground'>Address: </span>
        <span className='font-medium break-all'>{claims.email}</span>
      </p>
      <UnsubscribeForm token={token} />
    </div>
  );
}
