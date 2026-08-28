import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { sanitizeReturnPath } from '@/utils/return-path';
import {
  getOnboardingProgress,
  getNextStep,
  stepUrl,
} from './onboarding-progress';

export default function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <WelcomeRedirect searchParams={searchParams} />
    </Suspense>
  );
}

async function WelcomeRedirect({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const { returnUrl } = await searchParams;
  const dest = sanitizeReturnPath(returnUrl);

  const progress = await getOnboardingProgress();
  return redirect(stepUrl(getNextStep(progress), dest));
}
