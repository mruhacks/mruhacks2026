'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { consumeInvite } from '@/app/actions/users';
import { completeWelcomeOnboarding } from '@/app/dashboard/account/actions';
import { saveWelcomeProfile } from '@/app/dashboard/profile/actions';
import type {
  ProfileFormOptions,
  ProfileFormValues,
} from '@/components/profile-form/schema';
import type { FeaturedOnboardingEvent } from './featured-event-step';
import { WelcomeConsentPage } from './welcome-consent-page';
import { WelcomeEventPage } from './welcome-event-page';
import { WelcomeLayout, type WelcomeStep } from './welcome-layout';
import {
  WelcomePersonalPage,
  type PersonalOnboardingValues,
} from './welcome-personal-page';
import {
  WelcomeAboutPage,
  type AboutOnboardingValues,
} from './welcome-about-page';

interface WelcomeClientProps {
  needsConsent: boolean;
  needsProfile: boolean;
  isFirstLogin: boolean;
  userEmail: string;
  initialProfile?: Partial<ProfileFormValues>;
  options: ProfileFormOptions;
  featuredEvent?: FeaturedOnboardingEvent;
  returnUrl: string;
}

type Step = 'legal' | 'personal' | 'about' | 'event';

export function WelcomeClient({
  needsConsent,
  needsProfile,
  isFirstLogin,
  userEmail,
  initialProfile,
  options,
  featuredEvent,
  returnUrl,
}: WelcomeClientProps) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(
    needsConsent
      ? 'legal'
      : needsProfile
        ? 'personal'
        : featuredEvent
          ? 'event'
          : 'legal',
  );
  const [personal, setPersonal] = React.useState<PersonalOnboardingValues>({
    fullName: initialProfile?.fullName ?? '',
    genderId: initialProfile?.genderId ?? 0,
    dietaryRestrictions: initialProfile?.dietaryRestrictions ?? [],
  });
  const inviteConsumed = React.useRef(false);

  React.useEffect(() => {
    if (inviteConsumed.current) return;
    inviteConsumed.current = true;
    consumeInvite().then((result) => {
      if (!result.success) toast.error(result.error);
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

  const steps: WelcomeStep[] = [
    { id: 'legal', label: 'Legal' },
    { id: 'personal', label: 'Personal' },
    { id: 'about', label: 'About you' },
    ...(featuredEvent ? [{ id: 'event', label: 'Apply' }] : []),
  ];

  const legalComplete = () => {
    if (needsProfile) setStep('personal');
    else if (featuredEvent) setStep('event');
    else void finish();
  };

  const personalComplete = (data: PersonalOnboardingValues) => {
    setPersonal(data);
    setStep('about');
  };

  const aboutComplete = async (data: AboutOnboardingValues) => {
    const result = await saveWelcomeProfile({
      ...personal,
      ...data,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success('Profile saved.');
    if (featuredEvent) setStep('event');
    else void finish();
  };

  const eventComplete = () => {
    void finish();
  };

  return (
    <WelcomeLayout
      isFirstLogin={isFirstLogin}
      userEmail={userEmail}
      steps={steps}
      activeStep={step}
    >
      {step === 'legal' && <WelcomeConsentPage onComplete={legalComplete} />}
      {step === 'personal' && (
        <WelcomePersonalPage
          initial={initialProfile}
          options={options}
          onComplete={personalComplete}
        />
      )}
      {step === 'about' && (
        <WelcomeAboutPage
          options={options}
          onBack={() => setStep('personal')}
          onComplete={aboutComplete}
        />
      )}
      {step === 'event' && featuredEvent && (
        <WelcomeEventPage event={featuredEvent} onComplete={eventComplete} />
      )}
    </WelcomeLayout>
  );
}
