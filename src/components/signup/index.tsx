'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/utils/auth-client';
import {
  signUpFormSchema,
  type SignUpFormValues,
} from '@/components/signup/schema';

export default function SignUpForm() {
  const [loading, setLoading] = React.useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = React.useState(false);
  const [magicLinkSent, setMagicLinkSent] = React.useState(false);
  const router = useRouter();

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  function onSubmit(userDetails: SignUpFormValues) {
    authClient.signUp.email(userDetails, {
      onRequest: () => {
        setLoading(true);
      },
      onSuccess: () => {
        setLoading(false);
        toast.success('Account created successfully', {
          description: 'Check your inbox to verify your email.',
        });
        router.push('/dashboard/profile');
      },
      onError: (ctx) => {
        setLoading(false);
        toast.error('Sign-up failed', {
          description:
            ctx?.error?.message ?? 'An unexpected error occurred. Try again.',
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
      description: `We sent a magic link to ${email}.`,
    });
  }

  return (
    <Card className='w-full sm:max-w-md'>
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
        <CardDescription>
          Sign up to access your dashboard and manage your projects.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form id='form-signup' onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            {/* Name */}
            <Controller
              name='name'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-signup-name'>Full Name</FieldLabel>
                  <Input
                    {...field}
                    id='form-signup-name'
                    placeholder='John Doe'
                    autoComplete='name'
                    aria-invalid={fieldState.invalid}
                    disabled={loading}
                  />
                  <FieldDescription>
                    Please enter your full name.
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Email */}
            <Controller
              name='email'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-signup-email'>Email</FieldLabel>
                  <Input
                    {...field}
                    id='form-signup-email'
                    type='email'
                    placeholder='you@example.com'
                    autoComplete='email'
                    aria-invalid={fieldState.invalid}
                    disabled={loading}
                  />
                  <FieldDescription>
                    We&apos;ll send a confirmation link to this address.
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Password */}
            <Controller
              name='password'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-signup-password'>
                    Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id='form-signup-password'
                    type='password'
                    placeholder='••••••••'
                    autoComplete='new-password'
                    aria-invalid={fieldState.invalid}
                    disabled={loading}
                  />
                  <FieldDescription>
                    Must be at least 8 characters long.
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className='flex-col items-stretch gap-4'>
        <Field orientation='horizontal'>
          <Button
            type='button'
            variant='outline'
            onClick={() => form.reset()}
            disabled={loading || magicLinkLoading}
          >
            Reset
          </Button>
          <Button
            type='submit'
            form='form-signup'
            disabled={loading || magicLinkLoading}
          >
            {loading ? (
              <>
                <Loader2 className='mr-2 size-4 animate-spin' />
                Creating Account...
              </>
            ) : (
              'Sign Up'
            )}
          </Button>
        </Field>

        <div className='relative'>
          <div className='absolute inset-0 flex items-center'>
            <span className='border-border w-full border-t' />
          </div>
          <div className='relative flex justify-center text-xs uppercase'>
            <span className='bg-card text-muted-foreground px-2'>or</span>
          </div>
        </div>

        <Button
          type='button'
          variant='outline'
          onClick={handleMagicLink}
          disabled={loading || magicLinkLoading || magicLinkSent}
        >
          {magicLinkLoading ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' />
              Sending magic link...
            </>
          ) : magicLinkSent ? (
            'Magic link sent — check your email'
          ) : (
            'Sign up with magic link'
          )}
        </Button>

        <div className='text-sm'>
          <span>Already have an account?</span>
          <Link className='ml-1 font-medium hover:underline' href='/signin'>
            Sign In
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
