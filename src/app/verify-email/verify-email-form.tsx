'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { authClient } from '@/utils/auth-client';

export function VerifyEmailForm({ email }: { email: string }) {
  const [loading, setLoading] = React.useState(false);

  async function handleResend() {
    setLoading(true);
    const callbackURL = new URL('/dashboard', window.location.origin).href;
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL,
    });
    setLoading(false);
    if (error) {
      toast.error('Could not send email', {
        description: error.message ?? 'Please try again later.',
      });
      return;
    }
    toast.success('Verification email sent', {
      description: 'Check your inbox for the link.',
    });
  }

  return (
    <Card className='w-full sm:max-w-md'>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          We sent a verification link to{' '}
          <span className='font-medium text-foreground'>{email}</span>. Open
          the link in that message to continue. You can resend if it did not
          arrive.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className='text-muted-foreground text-sm'>
          After verifying, you will be redirected to your dashboard.
        </p>
      </CardContent>
      <CardFooter>
        <Button
          type='button'
          className='w-full'
          disabled={loading}
          onClick={() => void handleResend()}
        >
          {loading ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' />
              Sending…
            </>
          ) : (
            'Resend verification email'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
