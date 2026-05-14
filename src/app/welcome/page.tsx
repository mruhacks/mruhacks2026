import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { getUser } from '@/utils/auth';
import { currentUserHasPassword } from '@/app/actions/users';
import { WelcomeClient } from './welcome-client';

async function WelcomeContent() {
  const user = await getUser();
  if (!user) redirect('/signin');

  const res = await currentUserHasPassword();
  const hasPassword = res.success && res.data ? res.data.hasPassword : true;

  return (
    <WelcomeClient
      hasPassword={hasPassword}
      userEmail={user.email}
      userName={user.name ?? ''}
    />
  );
}

export default function WelcomePage() {
  return (
    <Suspense
      fallback={
        <div className='flex min-h-screen items-center justify-center'>
          <Loader2 className='size-6 animate-spin' />
        </div>
      }
    >
      <WelcomeContent />
    </Suspense>
  );
}
