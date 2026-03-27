'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import Link from 'next/link';
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/utils/auth-client';
import { publicAppAbsoluteUrl } from '@/utils/public-app-url';

const formSchema = z.object({
  email: z.email('Please enter a valid email address.'),
});

type FormValues = z.infer<typeof formSchema>;

export function ForgotPasswordForm() {
  const [loading, setLoading] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: FormValues) {
    setLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: publicAppAbsoluteUrl('/reset-password'),
    });
    setLoading(false);
    if (error) {
      toast.error('Request failed', {
        description: error.message ?? 'Please try again.',
      });
      return;
    }
    toast.success('Check your email', {
      description:
        'If an account exists for that address, we sent a reset link.',
    });
    form.reset();
  }

  return (
    <Card className='w-full sm:max-w-md'>
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a link to reset your
          password.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form id='form-forgot-password' onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name='email'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='form-forgot-email'>Email</FieldLabel>
                  <Input
                    {...field}
                    id='form-forgot-email'
                    type='email'
                    placeholder='you@example.com'
                    autoComplete='email'
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
          form='form-forgot-password'
          className='w-full'
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' />
              Sending…
            </>
          ) : (
            'Send reset link'
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
