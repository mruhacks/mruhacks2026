'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Loader2, MailCheck } from 'lucide-react';
import { authClient } from '@/utils/auth-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const formSchema = z.object({
  email: z.email('Please enter a valid email address.'),
  password: z.string(),
});

function GitHubIcon() {
  return (
    <svg viewBox='0 0 24 24' className='size-4 fill-current' aria-hidden='true'>
      <path d='M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12' />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox='0 0 24 24' className='size-4' aria-hidden='true'>
      <path
        d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
        fill='#4285F4'
      />
      <path
        d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
        fill='#34A853'
      />
      <path
        d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
        fill='#FBBC05'
      />
      <path
        d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
        fill='#EA4335'
      />
    </svg>
  );
}

export default function SignInForm() {
  const [loading, setLoading] = React.useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = React.useState(false);
  const [magicLinkSent, setMagicLinkSent] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = React.useState<string | null>(
    null,
  );
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  function onSubmit(credentials: z.infer<typeof formSchema>) {
    authClient.signIn.email(credentials, {
      onRequest: () => setLoading(true),
      onSuccess: () => {
        setLoading(false);
        toast.success('Signed in successfully', {
          description: 'Redirecting to your dashboard...',
        });
        router.push('/dashboard');
      },
      onError: (ctx) => {
        setLoading(false);
        const code = ctx?.error?.code;
        if (code === 'EMAIL_NOT_VERIFIED') {
          setUnverifiedEmail(credentials.email);
          return;
        }
        toast.error('Sign-in failed', {
          description:
            ctx?.error?.message ?? 'Invalid credentials or network issue.',
        });
      },
    });
  }

  async function handleMagicLink() {
    const email = form.getValues('email');
    const valid = await form.trigger('email');
    if (!valid || !email) {
      toast.error('Enter your email first');
      return;
    }
    setMagicLinkLoading(true);
    const res = await authClient.signIn.magicLink({
      email,
      callbackURL: '/welcome',
    });
    setMagicLinkLoading(false);
    if (res.error) {
      toast.error(res.error.message ?? 'Failed to send magic link');
      return;
    }
    setMagicLinkSent(true);
    toast.success('Check your email', {
      description: `We sent a sign-in link to ${email}.`,
    });
  }

  function handleSocial(provider: 'github' | 'google') {
    authClient.signIn.social({ provider, callbackURL: '/dashboard' });
  }

  if (unverifiedEmail) {
    return (
      <Card className='w-full sm:max-w-md'>
        <CardHeader>
          <div className='bg-muted mb-4 flex size-12 items-center justify-center rounded-full'>
            <MailCheck className='text-primary size-6' />
          </div>
          <CardTitle>Verify your email to continue</CardTitle>
          <CardDescription>
            Your account hasn&apos;t been verified yet. We sent a verification
            link to{' '}
            <span className='text-foreground font-medium'>
              {unverifiedEmail}
            </span>
            . Click the link in that email to activate your account and sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            Didn&apos;t receive the email? Check your spam folder, or{' '}
            <button
              type='button'
              className='font-medium underline underline-offset-4 hover:no-underline'
              onClick={() => setUnverifiedEmail(null)}
            >
              go back
            </button>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='w-full sm:max-w-md'>
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
        <CardDescription>
          {showPassword
            ? 'Enter your email and password to continue.'
            : 'Enter your email and we’ll send you a link — new or returning.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form id='form-signin' onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            {/* Email */}
            <Controller
              name='email'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-signin-email'>Email</FieldLabel>
                  <Input
                    {...field}
                    id='form-signin-email'
                    type='email'
                    placeholder='you@example.com'
                    autoComplete='email'
                    aria-invalid={fieldState.invalid}
                    disabled={loading || magicLinkLoading}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Password — only shown in password mode */}
            {showPassword && (
              <Controller
                name='password'
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <div className='flex items-center justify-between'>
                      <FieldLabel htmlFor='form-signin-password'>
                        Password
                      </FieldLabel>
                      <Link
                        href='/forgot-password'
                        className='text-xs font-medium hover:underline'
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <Input
                      {...field}
                      id='form-signin-password'
                      type='password'
                      placeholder='••••••••'
                      autoComplete='current-password'
                      disabled={loading}
                    />
                  </Field>
                )}
              />
            )}
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className='flex-col items-stretch gap-4'>
        {showPassword ? (
          <>
            <Field orientation='horizontal'>
              <Button
                type='button'
                variant='outline'
                onClick={() => form.reset()}
                disabled={loading}
              >
                Reset
              </Button>
              <Button type='submit' form='form-signin' disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' />
                    Signing In...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </Field>
            <button
              type='button'
              className='text-muted-foreground self-center text-sm hover:underline'
              onClick={() => setShowPassword(false)}
            >
              Use magic link instead
            </button>
          </>
        ) : (
          <>
            {/* Magic link primary action */}
            <Button
              type='button'
              onClick={handleMagicLink}
              disabled={loading || magicLinkLoading || magicLinkSent}
            >
              {magicLinkLoading ? (
                <>
                  <Loader2 className='mr-2 size-4 animate-spin' />
                  Sending link...
                </>
              ) : magicLinkSent ? (
                <>
                  <MailCheck className='mr-2 size-4' />
                  Check your inbox
                </>
              ) : (
                'Send magic link'
              )}
            </Button>

            {/* Divider */}
            <div className='relative'>
              <div className='absolute inset-0 flex items-center'>
                <span className='border-border w-full border-t' />
              </div>
              <div className='relative flex justify-center text-xs uppercase'>
                <span className='bg-card text-muted-foreground px-2'>or</span>
              </div>
            </div>

            {/* OAuth buttons */}
            <div className='flex flex-col gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => handleSocial('github')}
                disabled={loading || magicLinkLoading}
              >
                <GitHubIcon />
                <span className='ml-2'>Continue with GitHub</span>
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => handleSocial('google')}
                disabled={loading || magicLinkLoading}
              >
                <GoogleIcon />
                <span className='ml-2'>Continue with Google</span>
              </Button>
            </div>

            {/* Password toggle */}
            <button
              type='button'
              className='text-muted-foreground self-center text-sm hover:underline'
              onClick={() => setShowPassword(true)}
            >
              Have a password?
            </button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
