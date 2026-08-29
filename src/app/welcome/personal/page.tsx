import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { sanitizeReturnPath } from '@/utils/return-path';
import { oauthPrefillName } from '@/lib/oauth-name';
import { getOptions } from '@/app/dashboard/events/actions';
import { getUserProfile } from '@/app/dashboard/profile/actions';
import {
  canReviewStep,
  getOnboardingProgress,
  getNextStep,
  reviewStepUrl,
  stepUrl,
} from '../onboarding-progress';
import { WelcomePersonalPage } from '../welcome-personal-page';
import { WelcomePersonalSkeleton } from '../welcome-step-loading';

export default function PersonalStepPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string; review?: string }>;
}) {
  return (
    <Suspense fallback={<WelcomePersonalSkeleton />}>
      <PersonalStepContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PersonalStepContent({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string; review?: string }>;
}) {
  const { returnUrl, review } = await searchParams;
  const dest = sanitizeReturnPath(returnUrl);

  const progress = await getOnboardingProgress();
  const firstNeeded = getNextStep(progress);
  const reviewing = review === '1' && canReviewStep(progress, 'personal');
  if (firstNeeded !== 'personal' && !reviewing) {
    redirect(stepUrl(firstNeeded, dest));
  }

  const [options, profileResult] = await Promise.all([
    getOptions(),
    reviewing ? getUserProfile() : Promise.resolve(null),
  ]);
  const savedProfile =
    profileResult?.success && profileResult.data ? profileResult.data : null;
  const prefillName = oauthPrefillName(progress.user.oauthName);

  const next = getNextStep(progress, 'personal');

  return (
    <WelcomePersonalPage
      initial={
        savedProfile
          ? {
              fullName: savedProfile.fullName,
              genderId: savedProfile.genderId,
              genderOtherText: savedProfile.genderOtherText,
              dietaryRestrictions: savedProfile.dietaryRestrictions,
              dietaryOtherText: savedProfile.dietaryOtherText,
            }
          : prefillName
            ? { fullName: prefillName }
            : undefined
      }
      options={options}
      backHref={reviewStepUrl('legal', dest)}
      nextHref={stepUrl(next, dest)}
    />
  );
}
