'use client';

import {
  FeaturedEventStep,
  type FeaturedOnboardingEvent,
} from './featured-event-step';

export function WelcomeEventPage({
  event,
  onComplete,
}: {
  event: FeaturedOnboardingEvent;
  onComplete: () => void;
}) {
  return <FeaturedEventStep event={event} onComplete={onComplete} />;
}
