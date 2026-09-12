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

  const consent = reviewing ? await getConsent() : null;

  const next = getNextStep(progress, 'legal');

  return (
    <WelcomeConsentPage
      nextHref={stepUrl(next, dest)}
      isFinalStep={next === null}
      initialAcceptLegal={reviewing}
      initialMarketing={
        consent?.success ? (consent.data?.marketingEmails ?? false) : false
      }
    />
  );
}
