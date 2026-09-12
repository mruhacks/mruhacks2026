import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { sanitizeReturnPath } from '@/utils/return-path';
import {
  getOnboardingProgress,
  getNextStep,
  reviewStepUrl,
  stepUrl,
} from '../onboarding-progress';
import { WelcomeEventPage } from '../welcome-event-page';
import { WelcomeEventSkeleton } from '../welcome-step-loading';

export default function EventStepPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  return (
    <Suspense fallback={<WelcomeEventSkeleton />}>
      <EventStepContent searchParams={searchParams} />
    </Suspense>
  );
}

async function EventStepContent({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const { returnUrl } = await searchParams;
  const dest = sanitizeReturnPath(returnUrl);

  const progress = await getOnboardingProgress();
  const firstNeeded = getNextStep(progress);
  if (firstNeeded !== 'event' || !progress.featuredEvent) {
    redirect(stepUrl(firstNeeded, dest));
  }

  const next = getNextStep(progress, 'event');

  return (
    <WelcomeEventPage
      event={progress.featuredEvent}
      backHref={reviewStepUrl('about', dest)}
      nextHref={stepUrl(next, dest)}
      isFinalStep={next === null}
    />
  );
}
