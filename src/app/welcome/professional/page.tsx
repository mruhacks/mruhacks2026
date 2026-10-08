import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { sanitizeReturnPath } from '@/utils/return-path';
import { getProfessionalProfile } from '@/app/dashboard/profile/actions';
import {
  canReviewStep,
  getOnboardingProgress,
  getNextStep,
  reviewStepUrl,
  stepUrl,
} from '../onboarding-progress';
import { WelcomeProfessionalPage } from '../welcome-professional-page';
import { WelcomePersonalSkeleton } from '../welcome-step-loading';

export default function ProfessionalStepPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string; review?: string }>;
}) {
  return (
    <Suspense fallback={<WelcomePersonalSkeleton />}>
      <ProfessionalStepContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ProfessionalStepContent({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string; review?: string }>;
}) {
  const { returnUrl, review } = await searchParams;
  const dest = sanitizeReturnPath(returnUrl);

  const progress = await getOnboardingProgress();
  const firstNeeded = getNextStep(progress);
  const reviewing = review === '1' && canReviewStep(progress, 'professional');
  if (firstNeeded !== 'professional' && !reviewing) {
    redirect(stepUrl(firstNeeded, dest));
  }

  const profileResult = await getProfessionalProfile();
  const profile = profileResult.success ? profileResult.data : null;
  const next = getNextStep(progress, 'professional');

  return (
    <WelcomeProfessionalPage
      initial={profile ?? undefined}
      backHref={reviewStepUrl('personal', dest)}
      nextHref={stepUrl(next, dest)}
      isFinalStep={next === null}
    />
  );
}
