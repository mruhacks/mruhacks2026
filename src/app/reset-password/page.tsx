'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { authClient } from '@/utils/auth-client';
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

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');
  const error = params.get('error');

  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error('Missing reset token. Request a new link.');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    const res = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setSubmitting(false);
    if (res.error) {
      toast.error(res.error.message ?? 'Failed to reset password');
      return;
    }
    toast.success('Password updated. Please sign in.');
    router.push('/signin');
  };

  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>
            Choose a new password for your account.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error === 'invalid_token' || !token ? (
            <div className='space-y-3 text-sm'>
              <p className='text-destructive'>
                This reset link is invalid or has expired.
              </p>
              <p>
                <Link
                  href='/forgot-password'
                  className='font-medium hover:underline'
                >
                  Request a new link
                </Link>
              </p>
            </div>
          ) : (
            <form
              id='form-reset-password'
              onSubmit={handleSubmit}
              className='space-y-4'
            >
              <div className='space-y-2'>
                <Label htmlFor='new-password'>New password</Label>
                <Input
                  id='new-password'
                  type='password'
                  autoComplete='new-password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder='Min. 8 characters'
                  disabled={submitting}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='confirm-password'>Confirm password</Label>
                <Input
                  id='confirm-password'
                  type='password'
                  autoComplete='new-password'
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </form>
          )}
        </CardContent>

        {!error && token && (
          <CardFooter className='flex-col items-stretch gap-2'>
            <Button
              type='submit'
              form='form-reset-password'
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className='mr-2 size-4 animate-spin' />
                  Updating…
                </>
              ) : (
                'Update password'
              )}
            </Button>
            <Link
              href='/signin'
              className='text-muted-foreground text-center text-xs hover:underline'
            >
              Back to sign in
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
