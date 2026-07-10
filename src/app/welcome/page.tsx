import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { getUser } from '@/utils/auth';
import { getConsentStatus } from '@/app/dashboard/account/actions';
import { sanitizeReturnPath } from '@/utils/return-path';
import { WelcomeClient } from './welcome-client';

async function WelcomeContent({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const { returnUrl } = await searchParams;
  const dest = sanitizeReturnPath(returnUrl);

  const user = await getUser();
  if (!user) redirect('/signin');

  const res = await getConsentStatus();
  // Fail safe: if we can't read consent state, prompt for it rather than skip.
  const needsConsent = res.success && res.data ? res.data.needsConsent : true;

  return (
    <WelcomeClient
      needsConsent={needsConsent}
      userEmail={user.email}
      userName={user.name ?? ''}
      returnUrl={dest}
    />
  );
}

export default function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className='flex min-h-screen items-center justify-center'>
          <Loader2 className='size-6 animate-spin' />
        </div>
      }
    >
      <WelcomeContent searchParams={searchParams} />
    </Suspense>
  );
}
