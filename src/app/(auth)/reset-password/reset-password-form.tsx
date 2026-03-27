'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/utils/auth-client';

const formSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const errorParam = searchParams.get('error');

  const [loading, setLoading] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  async function onSubmit(values: FormValues) {
    if (!token) {
      toast.error('Missing token', {
        description: 'Use the link from your reset email.',
      });
      return;
    }
    setLoading(true);
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    });
    setLoading(false);
    if (error) {
      toast.error('Could not reset password', {
        description: error.message ?? 'The link may have expired.',
      });
      return;
    }
    toast.success('Password updated', {
      description: 'You can sign in with your new password.',
    });
    router.push('/signin');
  }

  if (errorParam === 'INVALID_TOKEN') {
    return (
      <Card className='w-full sm:max-w-md'>
        <CardHeader>
          <CardTitle>Invalid or expired link</CardTitle>
          <CardDescription>
            This reset link is not valid anymore. Request a new one from the
            forgot password page.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className='w-full'>
            <Link href='/forgot-password'>Request a new link</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!token) {
    return (
      <Card className='w-full sm:max-w-md'>
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>
            Open the link from your password reset email. It includes a token
            required to set a new password.
          </CardDescription>
        </CardHeader>
        <CardFooter className='flex-col gap-2'>
          <Button asChild variant='outline' className='w-full'>
            <Link href='/forgot-password'>Request reset email</Link>
          </Button>
          <Button asChild variant='ghost' className='w-full'>
            <Link href='/signin'>Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className='w-full sm:max-w-md'>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Choose a strong password for your account.</CardDescription>
      </CardHeader>

      <CardContent>
        <form id='form-reset-password' onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name='password'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-reset-password'>New password</FieldLabel>
                  <Input
                    {...field}
                    id='form-reset-password'
                    type='password'
                    placeholder='••••••••'
                    autoComplete='new-password'
                    aria-invalid={fieldState.invalid}
                    disabled={loading}
                  />
                  <FieldDescription>At least 8 characters.</FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name='confirmPassword'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-reset-confirm'>
                    Confirm password
                  </FieldLabel>
                  <Input
                    {...field}
                    id='form-reset-confirm'
                    type='password'
                    placeholder='••••••••'
                    autoComplete='new-password'
                    aria-invalid={fieldState.invalid}
                    disabled={loading}
                  />
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
        <Button
          type='submit'
          form='form-reset-password'
          className='w-full'
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' />
              Updating…
            </>
          ) : (
            'Update password'
          )}
        </Button>
        <p className='text-muted-foreground text-center text-sm'>
          <Link className='font-medium hover:underline' href='/signin'>
            Back to sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
