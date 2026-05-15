'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';

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
import type { OnboardingState } from '@/utils/auth';
import type { ApplicationFormOptions } from '@/components/application-form/schema';
import ProfileForm from '@/components/profile-form';
import { saveUserProfile } from '@/app/dashboard/profile/actions';

type WizardState = Exclude<OnboardingState, { step: 'complete' }>;

function initialStepFromState(state: WizardState): 1 | 2 | 3 {
  switch (state.step) {
    case 'unauthenticated':
      return 1;
    case 'unverified':
      return 2;
    case 'needs-profile':
      return 3;
  }
}

const STEP_LABELS = ['Create Account', 'Verify Email', 'Complete Profile'];

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className='mb-6 flex items-center justify-center gap-2'>
      {STEP_LABELS.map((label, i) => {
        const stepNum = (i + 1) as 1 | 2 | 3;
        const isComplete = stepNum < current;
        const isCurrent = stepNum === current;
        return (
          <React.Fragment key={label}>
            {i > 0 && (
              <div
                className={`h-px w-8 ${isComplete ? 'bg-primary' : 'bg-border'}`}
              />
            )}
            <div className='flex items-center gap-1.5'>
              <div
                className={`flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                  isComplete
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isComplete ? <Check className='size-3.5' /> : stepNum}
              </div>
              <span
                className={`hidden text-xs sm:inline ${isCurrent ? 'font-medium' : 'text-muted-foreground'}`}
              >
                {label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StepSignup({
  onComplete,
}: {
  onComplete: (email: string, name: string) => void;
}) {
  const [loading, setLoading] = React.useState(false);

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  function onSubmit(values: SignUpFormValues) {
    authClient.signUp.email(values, {
      onRequest: () => setLoading(true),
      onSuccess: async () => {
        const { error } = await authClient.emailOtp.sendVerificationOtp({
          email: values.email,
          type: 'email-verification',
        });
        setLoading(false);
        if (error) {
          toast.error('Could not send verification code', {
            description: error.message ?? 'Please try again.',
          });
          return;
        }
        toast.success('Account created', {
          description: 'Enter the verification code sent to your email.',
        });
        onComplete(values.email, values.name);
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

  return (
    <Card className='w-full sm:max-w-md'>
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
        <CardDescription>
          Sign up to get started with MRU Hacks.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form id='form-signup' onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
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
                    We&apos;ll send a verification code to this address.
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

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

      <CardFooter className='flex-col items-start'>
        <Button
          type='submit'
          form='form-signup'
          disabled={loading}
          className='w-full'
        >
          {loading ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' />
              Creating Account…
            </>
          ) : (
            'Create Account'
          )}
        </Button>

        <div className='mt-4 text-sm'>
          <span>Already have an account?</span>
          <Link className='ml-1 font-medium hover:underline' href='/signin'>
            Sign In
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

function StepVerifyEmail({
  email,
  onComplete,
  onBack,
}: {
  email: string;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [code, setCode] = React.useState('');

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;
    setLoading(true);
    const { error } = await authClient.emailOtp.verifyEmail({
      email,
      otp: code,
    });
    setLoading(false);
    if (error) {
      toast.error('Verification failed', {
        description: error.message ?? 'Invalid or expired code. Try again.',
      });
      return;
    }
    toast.success('Email verified');
    onComplete();
  }

  async function handleResend() {
    setResending(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'email-verification',
    });
    setResending(false);
    if (error) {
      toast.error('Could not resend code', {
        description: error.message ?? 'Please try again.',
      });
      return;
    }
    toast.success('New code sent', {
      description: 'Check your inbox.',
    });
  }

  async function handleUseOtherEmail() {
    await authClient.signOut();
    onBack();
  }

  return (
    <Card className='w-full sm:max-w-md'>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          Enter the 6-digit code sent to{' '}
          <span className='font-medium text-foreground'>{email}</span>.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form id='form-verify' onSubmit={handleVerify}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='otp-code'>Verification Code</FieldLabel>
              <Input
                id='otp-code'
                type='text'
                inputMode='numeric'
                pattern='[0-9]*'
                maxLength={6}
                placeholder='000000'
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                autoComplete='one-time-code'
                disabled={loading}
                className='text-center text-lg tracking-widest'
              />
            </Field>
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className='flex-col items-start gap-3'>
        <Button
          type='submit'
          form='form-verify'
          disabled={loading || code.length < 6}
          className='w-full'
        >
          {loading ? (
            <>
              <Loader2 className='mr-2 size-4 animate-spin' />
              Verifying…
            </>
          ) : (
            'Verify Email'
          )}
        </Button>

        <div className='flex w-full items-center justify-between text-sm'>
          <button
            type='button'
            className='inline-flex items-center gap-1 text-muted-foreground hover:underline'
            onClick={handleUseOtherEmail}
          >
            <ArrowLeft className='size-3' />
            Use a different email
          </button>

          <button
            type='button'
            className='text-muted-foreground hover:underline disabled:opacity-50'
            disabled={resending}
            onClick={() => void handleResend()}
          >
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        </div>
      </CardFooter>
    </Card>
  );
}

function StepProfile({
  name,
  options,
}: {
  name: string;
  options: ApplicationFormOptions;
}) {
  return (
    <Card className='w-full sm:max-w-2xl'>
      <CardHeader>
        <CardTitle>Complete your profile</CardTitle>
        <CardDescription>
          Fill out your profile so you can apply to events.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileForm
          initial={{ fullName: name }}
          options={options}
          onSubmit={saveUserProfile}
          submitLabel='Finish Setup'
          successMessage='Profile saved — welcome to MRU Hacks!'
        />
      </CardContent>
    </Card>
  );
}

export default function OnboardingWizard({
  initialState,
  options,
}: {
  initialState: WizardState;
  options: ApplicationFormOptions;
}) {
  const [step, setStep] = React.useState<1 | 2 | 3>(() =>
    initialStepFromState(initialState),
  );
  const [email, setEmail] = React.useState(
    initialState.step === 'unverified' ? initialState.email : '',
  );
  const [userName, setUserName] = React.useState(
    initialState.step === 'needs-profile' ? initialState.name : '',
  );

  return (
    <div className='w-full max-w-2xl'>
      <StepIndicator current={step} />

      {step === 1 && (
        <StepSignup
          onComplete={(completedEmail, completedName) => {
            setEmail(completedEmail);
            setUserName(completedName);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <StepVerifyEmail
          email={email}
          onComplete={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && <StepProfile name={userName} options={options} />}
    </div>
  );
}
