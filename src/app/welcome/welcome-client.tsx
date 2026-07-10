'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';

import { consumeInvite } from '@/app/actions/users';
import {
  completeWelcomeOnboarding,
  recordOnboardingConsent,
} from '@/app/dashboard/account/actions';
import { saveUserProfile } from '@/app/dashboard/profile/actions';
import ProfileForm from '@/components/profile-form';
import type {
  ProfileFormOptions,
  ProfileFormValues,
} from '@/components/profile-form/schema';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup } from '@/components/ui/field';
import { Label } from '@/components/ui/label';

interface WelcomeClientProps {
  needsConsent: boolean;
  needsProfile: boolean;
  isFirstLogin: boolean;
  userEmail: string;
  initialProfile?: Partial<ProfileFormValues>;
  options: ProfileFormOptions;
  /** Where to send the user once onboarding is complete. */
  returnUrl: string;
}

type Step = 'profile' | 'consent';

export function WelcomeClient({
  needsConsent,
  needsProfile,
  isFirstLogin,
  userEmail,
  initialProfile,
  options,
  returnUrl,
}: WelcomeClientProps) {
  const router = useRouter();
  const initialStep: Step = needsProfile ? 'profile' : 'consent';
  const [step, setStep] = React.useState<Step>(initialStep);
  const [acceptLegal, setAcceptLegal] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);
  const [legalError, setLegalError] = React.useState<string>();
  const [submitting, setSubmitting] = React.useState(false);
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    consumeInvite().then((res) => {
      if (!res.success) toast.error(res.error);
    });
  }, []);

  const finish = async () => {
    const result = await completeWelcomeOnboarding();
    if (!result.success) {
      toast.error(result.error ?? 'Unable to finish setup.');
      return;
    }
    toast.success('All set. Welcome aboard!');
    router.push(returnUrl);
  };

  const handleProfileSaved = () => {
    if (needsConsent) {
      setStep('consent');
    } else {
      void finish();
    }
  };

  const handleConsent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!acceptLegal) {
      setLegalError('You must accept the Terms of Use and Privacy Policy.');
      return;
    }

    setSubmitting(true);
    const result = await recordOnboardingConsent(marketing);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    await finish();
  };

  const steps = [
    ...(needsProfile ? [{ id: 'profile' as const, label: 'Profile' }] : []),
    ...(needsConsent ? [{ id: 'consent' as const, label: 'Terms' }] : []),
  ];
  const currentStep = steps.findIndex((item) => item.id === step) + 1;

  return (
    <div className='flex min-h-screen items-center justify-center px-4 py-8'>
      <Card className='w-full max-w-2xl'>
        <CardHeader>
          <CardTitle>{isFirstLogin ? 'Welcome!' : 'Welcome back!'}</CardTitle>
          <CardDescription>
            Signed in as <span className='font-medium'>{userEmail}</span>. Set
            up your account to continue.
          </CardDescription>
          {steps.length > 1 && (
            <ol
              className='mt-4 flex items-center gap-2 text-sm'
              aria-label='Onboarding progress'
            >
              {steps.map((item, index) => {
                const complete = index + 1 < currentStep;
                const active = item.id === step;
                return (
                  <li key={item.id} className='flex flex-1 items-center gap-2'>
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        complete || active
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {complete ? <Check className='size-4' /> : index + 1}
                    </span>
                    <span
                      className={
                        active ? 'font-medium' : 'text-muted-foreground'
                      }
                    >
                      {item.label}
                    </span>
                    {index < steps.length - 1 && (
                      <span className='bg-border h-px flex-1' />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardHeader>

        {step === 'profile' && (
          <CardContent>
            <ProfileForm
              initial={initialProfile}
              options={options}
              onSubmit={saveUserProfile}
              submitLabel={needsConsent ? 'Continue' : 'Finish setup'}
              successMessage='Profile saved.'
              onSuccess={handleProfileSaved}
            />
          </CardContent>
        )}

        {step === 'consent' && (
          <form onSubmit={handleConsent} noValidate>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={Boolean(legalError)}>
                  <div className='flex items-start gap-3'>
                    <Checkbox
                      id='welcome-legal'
                      checked={acceptLegal}
                      onCheckedChange={(value) => {
                        setAcceptLegal(value === true);
                        setLegalError(undefined);
                      }}
                      disabled={submitting}
                      className='mt-0.5'
                    />
                    <Label
                      htmlFor='welcome-legal'
                      className='text-sm leading-snug font-normal'
                    >
                      I agree to the{' '}
                      <Link
                        href='/terms'
                        target='_blank'
                        className='text-primary underline underline-offset-2'
                      >
                        Terms of Use
                      </Link>{' '}
                      and{' '}
                      <Link
                        href='/privacy'
                        target='_blank'
                        className='text-primary underline underline-offset-2'
                      >
                        Privacy Policy
                      </Link>
                      .
                    </Label>
                  </div>
                  {legalError && <FieldError>{legalError}</FieldError>}
                </Field>
                <Field>
                  <div className='flex items-start gap-3'>
                    <Checkbox
                      id='welcome-marketing'
                      checked={marketing}
                      onCheckedChange={(value) => setMarketing(value === true)}
                      disabled={submitting}
                      className='mt-0.5'
                    />
                    <Label
                      htmlFor='welcome-marketing'
                      className='text-muted-foreground text-sm leading-snug font-normal'
                    >
                      Send me newsletters, sponsor offers, and updates about
                      future MRUHacks events.
                    </Label>
                  </div>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className='flex gap-3'>
              {needsProfile && (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setStep('profile')}
                  disabled={submitting}
                >
                  Back
                </Button>
              )}
              <Button type='submit' disabled={submitting} className='flex-1'>
                {submitting ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' /> Saving...
                  </>
                ) : (
                  'Finish setup'
                )}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
