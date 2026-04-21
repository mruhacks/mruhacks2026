'use client';

import * as React from 'react';
import Link from 'next/link';
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Enter your email');
      return;
    }
    setSubmitting(true);
    const res = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    setSubmitting(false);
    if (res.error) {
      toast.error(res.error.message ?? 'Failed to send reset email');
      return;
    }
    setSent(true);
  };

  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle>Forgot password</CardTitle>
          <CardDescription>
            {sent
              ? 'If an account exists for that email, a reset link is on its way.'
              : 'Enter your email and we’ll send you a link to reset your password.'}
          </CardDescription>
        </CardHeader>

        {!sent && (
          <CardContent>
            <form
              id='form-forgot-password'
              onSubmit={handleSubmit}
              className='space-y-4'
            >
              <div className='space-y-2'>
                <Label htmlFor='forgot-email'>Email</Label>
                <Input
                  id='forgot-email'
                  type='email'
                  autoComplete='email'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder='you@example.com'
                  disabled={submitting}
                />
              </div>
            </form>
          </CardContent>
        )}

        <CardFooter className='flex-col items-stretch gap-2'>
          {!sent && (
            <Button
              type='submit'
              form='form-forgot-password'
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className='mr-2 size-4 animate-spin' />
                  Sending…
                </>
              ) : (
                'Send reset link'
              )}
            </Button>
          )}
          <Link
            href='/signin'
            className='text-muted-foreground text-center text-xs hover:underline'
          >
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
