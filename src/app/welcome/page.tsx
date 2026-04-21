import { redirect } from 'next/navigation';

import { getUser } from '@/utils/auth';
import { currentUserHasPassword } from '@/app/actions/users';
import { WelcomeClient } from './welcome-client';

export default async function WelcomePage() {
  const user = await getUser();
  if (!user) redirect('/signin');

  const res = await currentUserHasPassword();
  const hasPassword = res.success && res.data ? res.data.hasPassword : true;

  return <WelcomeClient hasPassword={hasPassword} userEmail={user.email} />;
}
