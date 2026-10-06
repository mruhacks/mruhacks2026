import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { sanitizeReturnPath } from '@/utils/return-path';
import { getConsent } from '@/app/dashboard/account/actions';
import {
  canReviewStep,
  getOnboardingProgress,
  getNextStep,
  stepUrl,
} from '../onboarding-progress';
import { WelcomeConsentPage } from '../welcome-consent-page';
import { WelcomeLegalSkeleton } from '../welcome-step-loading';

export default function LegalStepPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string; review?: string }>;
}) {
  return (
    <Suspense fallback={<WelcomeLegalSkeleton />}>
      <LegalStepContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LegalStepContent({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string; review?: string }>;
}) {
  const { returnUrl, review } = await searchParams;
  const dest = sanitizeReturnPath(returnUrl);

  const progress = await getOnboardingProgress();
  const firstNeeded = getNextStep(progress);
  const reviewing = review === '1' && canReviewStep(progress, 'legal');
  if (firstNeeded !== 'legal' && !reviewing) {
    redirect(stepUrl(firstNeeded, dest));
  }

  const consent = await getConsent();
  const consentData = consent.success ? consent.data : undefined;
  // Accepted an older version before: the policy changed under them, so the
  // step says so, and keeps their marketing choice rather than resetting it
  // to "off" (submitting records whatever that box says).
  const isReacceptance =
    !reviewing &&
    (consentData?.termsVersion != null || consentData?.privacyVersion != null);

  const next = getNextStep(progress, 'legal');

  return (
    <WelcomeConsentPage
      nextHref={stepUrl(next, dest)}
      isFinalStep={next === null}
      isReacceptance={isReacceptance}
      initialAcceptLegal={reviewing}
      initialMarketing={consentData?.marketingEmails ?? false}
    />
  );
}
