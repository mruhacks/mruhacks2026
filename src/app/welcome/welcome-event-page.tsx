'use client';

import {
  FeaturedEventStep,
  type FeaturedOnboardingEvent,
} from './featured-event-step';

export function WelcomeEventPage({
  event,
  backHref,
  nextHref,
  isFinalStep,
}: {
  event: FeaturedOnboardingEvent;
  backHref: string;
  nextHref: string;
  isFinalStep: boolean;
}) {
  return (
    <FeaturedEventStep
      event={event}
      backHref={backHref}
      nextHref={nextHref}
      isFinalStep={isFinalStep}
    />
  );
}
