import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Loader2 } from 'lucide-react';

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
import { getOptions } from '@/app/dashboard/events/actions';
import { sanitizeReturnPath } from '@/utils/return-path';
import { WelcomeClient } from './welcome-client';
import type { FeaturedOnboardingEvent } from './featured-event-step';

async function WelcomeContent({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const { returnUrl } = await searchParams;
  const dest = sanitizeReturnPath(returnUrl);

  const user = await getUser();
  if (!user) redirect('/signin');

  const [res, profileRes, options, [account], [featured]] = await Promise.all([
    getConsentStatus(),
    getUserProfile(),
    getOptions(),
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
      })
      .from(events)
      .where(eq(events.isFeatured, true))
      .limit(1),
  ]);
  // Fail safe: if we can't read consent state, prompt for it rather than skip.
  const needsConsent = res.success && res.data ? res.data.needsConsent : true;
  // Fail safe for an unreadable profile too: avoid allowing a partially
  // initialized account through the onboarding gate.
  const needsProfile = !profileRes.success || profileRes.data == null;

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

  if (!needsConsent && !needsProfile && !featuredEvent) redirect(dest);

  return (
    <WelcomeClient
      needsConsent={needsConsent}
      needsProfile={needsProfile}
      isFirstLogin={account?.onboardingCompletedAt == null}
      userEmail={user.email}
      initialProfile={
        profileRes.success ? (profileRes.data ?? undefined) : undefined
      }
      options={options}
      featuredEvent={featuredEvent}
      returnUrl={dest}
    />
  );
}

export default function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className='flex min-h-screen items-center justify-center'>
          <Loader2 className='size-6 animate-spin' />
        </div>
      }
    >
      <WelcomeContent searchParams={searchParams} />
    </Suspense>
  );
}
