'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  consumeInvite,
  setInitialPassword,
  setOwnName,
} from '@/app/actions/users';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface WelcomeClientProps {
  hasPassword: boolean;
  userEmail: string;
  userName: string;
}

export function WelcomeClient({
  hasPassword,
  userEmail,
  userName,
}: WelcomeClientProps) {
  const router = useRouter();
  const needsName = userName.trim().length === 0;
  const needsPassword = !hasPassword;
  const needsOnboarding = needsName || needsPassword;

  const [consumed, setConsumed] = React.useState(false);
  const [name, setName] = React.useState(userName);
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    consumeInvite().then((res) => {
      if (res.success && res.data) setConsumed(res.data.consumed);
      else if (!res.success) toast.error(res.error);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsName && name.trim().length === 0) {
      toast.error('Enter your full name');
      return;
    }
    if (needsPassword) {
      if (password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }
      if (password !== confirm) {
        toast.error('Passwords do not match');
        return;
      }
    }
    setSubmitting(true);
    if (needsName) {
      const nameRes = await setOwnName(name);
      if (!nameRes.success) {
        setSubmitting(false);
        toast.error(nameRes.error);
        return;
      }
    }
    if (needsPassword) {
      const pwRes = await setInitialPassword(password);
      if (!pwRes.success) {
        setSubmitting(false);
        toast.error(pwRes.error);
        return;
      }
    }
    setSubmitting(false);
    toast.success('All set. Welcome aboard!');
    router.push('/dashboard');
  };

  const description = needsOnboarding ? (
    <>
      Signed in as <span className='font-medium'>{userEmail}</span>. Finish your
      account to continue.
    </>
  ) : (
    <>
      Signed in as <span className='font-medium'>{userEmail}</span>.
    </>
  );

  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Welcome{consumed ? '!' : ' back'}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>

        {needsOnboarding ? (
          <>
            <CardContent>
              <form
                id='form-welcome-onboarding'
                onSubmit={handleSubmit}
                className='space-y-4'
              >
                {needsName && (
                  <div className='space-y-2'>
                    <Label htmlFor='welcome-name'>Full name</Label>
                    <Input
                      id='welcome-name'
                      autoComplete='name'
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder='Jane Doe'
                      disabled={submitting}
                      required
                    />
                  </div>
                )}
                {needsPassword && (
                  <>
                    <div className='space-y-2'>
                      <Label htmlFor='welcome-password'>Password</Label>
                      <Input
                        id='welcome-password'
                        type='password'
                        autoComplete='new-password'
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder='Min. 8 characters'
                        disabled={submitting}
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='welcome-confirm'>Confirm password</Label>
                      <Input
                        id='welcome-confirm'
                        type='password'
                        autoComplete='new-password'
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  </>
                )}
              </form>
            </CardContent>
            <CardFooter>
              <Button
                type='submit'
                form='form-welcome-onboarding'
                disabled={submitting}
                className='w-full'
              >
                {submitting ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' />
                    Saving…
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </CardFooter>
          </>
        ) : (
          <CardFooter>
            <Button asChild className='w-full'>
              <Link href='/dashboard'>Go to dashboard</Link>
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
