/**
 * Shared server-side gate for the welcome wizard's routed steps. Its private
 * cache is scoped to the current browser session, so the layout and step page
 * share one aggregate without placing user data in the shared server cache.
 */
import { redirect } from 'next/navigation';
import { cacheLife } from 'next/cache';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import {
  eventApplications,
  eventAttendees,
  events,
  user as authUser,
} from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getConsentStatus } from '@/app/dashboard/account/actions';
import { getUserProfile } from '@/app/dashboard/profile/actions';
import type { FeaturedOnboardingEvent } from './featured-event-step';

export const STEPS = ['legal', 'personal', 'about', 'event'] as const;
export type Step = (typeof STEPS)[number];

export const isStep = (value: unknown): value is Step =>
  typeof value === 'string' && (STEPS as readonly string[]).includes(value);

export type OnboardingProgress = {
  user: NonNullable<Awaited<ReturnType<typeof getUser>>>;
  needsConsent: boolean;
  needsPersonal: boolean;
  needsAbout: boolean;
  featuredEvent?: FeaturedOnboardingEvent;
  isFirstLogin: boolean;
};

export async function getOnboardingProgress(): Promise<OnboardingProgress> {
  'use cache: private';
  cacheLife('minutes');

  const user = await getUser();
  if (!user) redirect('/signin');

  const [consentRes, profileRes, [userRow], [featured]] = await Promise.all([
    getConsentStatus(),
    getUserProfile(),
    db
      .select({ onboardingCompletedAt: authUser.onboardingCompletedAt })
      .from(authUser)
      .where(eq(authUser.id, user.id))
      .limit(1),
    db
      .select({
        id: events.id,
        name: events.name,
        hasApplication: events.hasApplication,
        applicationQuestions: events.applicationQuestions,
        startsAt: events.startsAt,
        teamsEnabled: events.teamsEnabled,
      })
      .from(events)
      .where(eq(events.isFeatured, true))
      .limit(1),
  ]);

  // Fail safe: if we can't read consent/profile state, prompt for it
  // rather than skip — never let an unreadable state through the gate.
  const needsConsent =
    consentRes.success && consentRes.data ? consentRes.data.needsConsent : true;
  const needsPersonal = !profileRes.success || profileRes.data == null;
  const needsAbout =
    !profileRes.success ||
    profileRes.data == null ||
    profileRes.data.universityId == null;

  let featuredEvent: FeaturedOnboardingEvent | undefined;
  if (featured) {
    const [existingApplication, existingAttendance] = await Promise.all([
      featured.hasApplication
        ? db
            .select({ id: eventApplications.id })
            .from(eventApplications)
            .where(
              and(
                eq(eventApplications.eventId, featured.id),
                eq(eventApplications.userId, user.id),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
      featured.hasApplication
        ? Promise.resolve([])
        : db
            .select({ userId: eventAttendees.userId })
            .from(eventAttendees)
            .where(
              and(
                eq(eventAttendees.eventId, featured.id),
                eq(eventAttendees.userId, user.id),
              ),
            )
            .limit(1),
    ]);

    if (existingApplication.length === 0 && existingAttendance.length === 0) {
      featuredEvent = {
        ...featured,
        applicationQuestions: featured.applicationQuestions ?? [],
      };
    }
  }

  return {
    user,
    needsConsent,
    needsPersonal,
    needsAbout,
    featuredEvent,
    isFirstLogin: userRow?.onboardingCompletedAt == null,
  };
}

function stepNeeded(progress: OnboardingProgress, step: Step): boolean {
  switch (step) {
    case 'legal':
      return progress.needsConsent;
    case 'personal':
      return progress.needsPersonal;
    case 'about':
      return progress.needsAbout;
    case 'event':
      return progress.featuredEvent != null;
  }
}

/**
 * A completed step can be reopened only while a later onboarding step is still
 * pending. This permits deliberate backward review without letting a crafted
 * URL skip an incomplete prerequisite or reopen onboarding after it is done.
 */
export function canReviewStep(
  progress: OnboardingProgress,
  step: Step,
): boolean {
  const firstNeeded = getNextStep(progress);
  return (
    firstNeeded !== null &&
    !stepNeeded(progress, step) &&
    STEPS.indexOf(step) < STEPS.indexOf(firstNeeded)
  );
}

/**
 * First step still needed, scanning from just after `after` (or from the
 * start if omitted). Null means nothing remains — onboarding is done.
 */
export function getNextStep(
  progress: OnboardingProgress,
  after?: Step,
): Step | null {
  const startIndex = after ? STEPS.indexOf(after) + 1 : 0;
  for (let i = startIndex; i < STEPS.length; i++) {
    if (stepNeeded(progress, STEPS[i])) return STEPS[i];
  }
  return null;
}

/** Builds the URL for a step (or `returnUrl` itself when step is null), carrying returnUrl through. */
export function stepUrl(step: Step | null, returnUrl: string): string {
  if (step === null) return returnUrl;
  return `/welcome/${step}?returnUrl=${encodeURIComponent(returnUrl)}`;
}

/** Builds a URL that deliberately reopens an already-completed step. */
export function reviewStepUrl(step: Step, returnUrl: string): string {
  return `${stepUrl(step, returnUrl)}&review=1`;
}
