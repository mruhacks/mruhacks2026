import SignInForm from '@/components/signIn';
import { getUser } from '@/utils/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  if (await getUser()) redirect('/dashboard');

  return <SignInForm />;
}
