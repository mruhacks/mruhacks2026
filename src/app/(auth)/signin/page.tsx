import SignInForm from '@/components/signIn';

// Signed-in users are redirected to the dashboard by `src/proxy.ts`.
export default function LoginPage() {
  return <SignInForm />;
}
