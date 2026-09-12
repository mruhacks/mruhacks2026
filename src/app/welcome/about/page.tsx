import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { sanitizeReturnPath } from '@/utils/return-path';
import { getOptions } from '@/app/dashboard/events/actions';
import { getUserProfile } from '@/app/dashboard/profile/actions';
import {
  canReviewStep,
  getOnboardingProgress,
  getNextStep,
  reviewStepUrl,
  stepUrl,
} from '../onboarding-progress';
import { WelcomeAboutPage } from '../welcome-about-page';
import { WelcomeAboutSkeleton } from '../welcome-step-loading';

export default function AboutStepPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string; review?: string }>;
}) {
  return (
    <Suspense fallback={<WelcomeAboutSkeleton />}>
      <AboutStepContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AboutStepContent({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string; review?: string }>;
}) {
  const { returnUrl, review } = await searchParams;
  const dest = sanitizeReturnPath(returnUrl);

  const progress = await getOnboardingProgress();
  const firstNeeded = getNextStep(progress);
  const reviewing = review === '1' && canReviewStep(progress, 'about');
  if (firstNeeded !== 'about' && !reviewing) {
    redirect(stepUrl(firstNeeded, dest));
  }

  const [options, profileResult] = await Promise.all([
    getOptions(),
    getUserProfile(),
  ]);
  const profile = profileResult.success ? profileResult.data : null;

  const next = getNextStep(progress, 'about');

  return (
    <WelcomeAboutPage
      options={options}
      initial={
        profile
          ? {
              universityId: profile.universityId ?? undefined,
              universityOtherText: profile.universityOtherText,
              majorId: profile.majorId ?? undefined,
              majorOtherText: profile.majorOtherText,
              yearOfStudyId: profile.yearOfStudyId ?? undefined,
              linkedinUrl: profile.linkedinUrl,
              githubUrl: profile.githubUrl,
              attendedHackathonBefore: profile.attendedHackathonBefore,
            }
          : undefined
      }
      hasResume={profile?.hasResume === true}
      resumeFileName={profile?.resumeFileName ?? null}
      backHref={reviewStepUrl('personal', dest)}
      nextHref={stepUrl(next, dest)}
      isFinalStep={next === null}
    />
  );
}
