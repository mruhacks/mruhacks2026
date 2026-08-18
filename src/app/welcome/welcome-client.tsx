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
  hasResume: boolean;
  resumeFileName: string | null;
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
  hasResume,
  resumeFileName,
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
    genderOtherText: initialProfile?.genderOtherText ?? '',
    dietaryRestrictions: initialProfile?.dietaryRestrictions ?? [],
    dietaryOtherText: initialProfile?.dietaryOtherText ?? '',
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

  // WelcomeAboutPage saves the profile itself (and any queued resume) before
  // calling onComplete, so all this needs to do is advance the wizard.
  const saveAboutData = (data: AboutOnboardingValues) =>
    saveWelcomeProfile({ ...personal, ...data });

  const aboutComplete = () => {
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
      onStepClick={(id) => setStep(id as Step)}
    >
      {/* Steps stay mounted (just hidden) once reached, rather than being
          unmounted on navigation, so react-hook-form state — and anything
          the user typed — survives going back and forth between steps. */}
      <div className={step === 'legal' ? undefined : 'hidden'}>
        <WelcomeConsentPage onComplete={legalComplete} />
      </div>
      <div className={step === 'personal' ? undefined : 'hidden'}>
        <WelcomePersonalPage
          initial={initialProfile}
          options={options}
          onComplete={personalComplete}
        />
      </div>
      <div className={step === 'about' ? undefined : 'hidden'}>
        <WelcomeAboutPage
          options={options}
          hasResume={hasResume}
          resumeFileName={resumeFileName}
          onBack={() => setStep('personal')}
          onComplete={aboutComplete}
          onSaveDraft={saveAboutData}
        />
      </div>
      {featuredEvent && (
        <div className={step === 'event' ? undefined : 'hidden'}>
          <WelcomeEventPage event={featuredEvent} onComplete={eventComplete} />
        </div>
      )}
    </WelcomeLayout>
  );
}
