export const instant = false;

import SignInForm from '@/components/signIn';
import { getUser } from '@/utils/auth';
import { redirect } from 'next/navigation';

async function SignInGate() {
  if (await getUser()) redirect('/dashboard');

  return <SignInForm />;
}

export default function LoginPage() {
  return <SignInGate />;
}
