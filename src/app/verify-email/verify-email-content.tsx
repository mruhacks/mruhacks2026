import { redirect } from 'next/navigation';
import { getSession } from '@/utils/auth';
import { VerifyEmailForm } from './verify-email-form';

export default async function VerifyEmailContent() {
  const session = await getSession();
  if (!session) {
    redirect(`/signin?callbackUrl=${encodeURIComponent('/verify-email')}`);
  }
  if (session.user.emailVerified) {
    redirect('/dashboard');
  }

  return <VerifyEmailForm email={session.user.email} />;
}
