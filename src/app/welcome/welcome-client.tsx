'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { consumeInvite, setInitialPassword } from '@/app/actions/users';
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
}

export function WelcomeClient({ hasPassword, userEmail }: WelcomeClientProps) {
  const router = useRouter();
  const [consumed, setConsumed] = React.useState(false);
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

  const skipToDashboard = () => router.push('/dashboard');

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    const res = await setInitialPassword(password);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success('Password set. Welcome aboard!');
    router.push('/dashboard');
  };

  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Welcome{consumed ? '!' : ' back'}</CardTitle>
          <CardDescription>
            Signed in as <span className='font-medium'>{userEmail}</span>.
            {!hasPassword &&
              ' Set a password so you can sign in next time without a magic link.'}
          </CardDescription>
        </CardHeader>

        {!hasPassword ? (
          <>
            <CardContent>
              <form
                id='form-welcome-set-password'
                onSubmit={handleSetPassword}
                className='space-y-4'
              >
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
              </form>
            </CardContent>
            <CardFooter className='flex-col items-stretch gap-2'>
              <Button
                type='submit'
                form='form-welcome-set-password'
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' />
                    Saving…
                  </>
                ) : (
                  'Set password and continue'
                )}
              </Button>
              <button
                type='button'
                onClick={skipToDashboard}
                className='text-muted-foreground text-center text-xs hover:underline'
              >
                Skip for now
              </button>
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
