import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';

import { getUser } from '@/utils/auth';
import {
  getOptions,
  getPreviousFormSubmission,
  getUserParticipation,
  submitEventApplication,
} from '@/app/dashboard/events/actions';
import {
  getUserProfile,
  type UserProfileData,
} from '@/app/dashboard/profile/actions';
import { db } from '@/utils/db';
import { events } from '@/db/schema';
import { hasEventElapsed, resolveEventId } from '@/lib/events';
import { eq } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProfileView } from '@/components/profile-view';
import ApplicationForm from '@/components/application-form';
import type { ProfileFormValues } from '@/components/profile-form/schema';
import type { EventOnlyFormValues } from '@/components/application-form/schema';
import { ApplicationStatusBanner } from '@/app/dashboard/events/ApplicationStatusBanner';
import { oauthPrefillName } from '@/lib/oauth-name';
import { canEditApplication } from '@/lib/participation/status';

type PreviousSubmission = {
  fullName: string;
  genderId: number;
  genderOtherText: string;
  universityId: number;
  universityOtherText: string;
  majorId: number;
  majorOtherText: string;
  yearOfStudyId: number;
  linkedinUrl: string;
  githubUrl: string;
  dietaryRestrictions: number[];
  dietaryOtherText: string;
  applicationResponses: Record<string, unknown>;
};

function buildApplyInitials(
  prev: PreviousSubmission | null,
  profileData: UserProfileData | null,
  user: { oauthName?: string | null },
): {
  profileInitial: Partial<ProfileFormValues> & { fullName: string };
  eventInitial: Partial<EventOnlyFormValues>;
} {
  const profileInitial = prev
    ? {
        fullName: prev.fullName,
        genderId: prev.genderId,
        genderOtherText: prev.genderOtherText ?? '',
        universityId: prev.universityId,
        universityOtherText: prev.universityOtherText ?? '',
        majorId: prev.majorId,
        majorOtherText: prev.majorOtherText ?? '',
        yearOfStudyId: prev.yearOfStudyId,
        linkedinUrl: prev.linkedinUrl ?? '',
        githubUrl: prev.githubUrl ?? '',
        dietaryRestrictions: prev.dietaryRestrictions ?? [],
        dietaryOtherText: prev.dietaryOtherText ?? '',
      }
    : profileData
      ? {
          ...profileData,
          // This page is only reachable with a fully-onboarded profile, so
          // these are never actually null here — just normalizing the type.
          universityId: profileData.universityId ?? undefined,
          majorId: profileData.majorId ?? undefined,
          yearOfStudyId: profileData.yearOfStudyId ?? undefined,
        }
      : { fullName: oauthPrefillName(user.oauthName) };

  const eventInitial = prev
    ? { applicationResponses: prev.applicationResponses ?? {} }
    : { applicationResponses: {} as Record<string, unknown> };

  return { profileInitial, eventInitial };
}

type Props = {
  params: Promise<{ eventId: string }>;
};

export default async function ApplyEventPage({ params }: Props) {
  // The segment may be the event's custom slug rather than its uuid.
  const { eventId: segment } = await params;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();
  const user = await getUser();
  if (!user) redirect('/signin');

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) notFound();
  if (!event.hasApplication) {
    return (
      <Card className='w-full sm:max-w-2xl'>
        <CardHeader>
          <CardTitle>No application required</CardTitle>
          <CardDescription>
            This event does not have an application. You can register to attend
            from the event page.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [previousApplication, options, profileResult, applicationStatus] =
    await Promise.all([
      getPreviousFormSubmission(eventId),
      getOptions(),
      getUserProfile(),
      getUserParticipation(eventId),
    ]);

  const hasProfile = profileResult.success && profileResult.data != null;
  const profileData = hasProfile ? profileResult.data : null;
  const prev = previousApplication.success ? previousApplication.data : null;

  const { profileInitial, eventInitial } = buildApplyInitials(
    prev ?? null,
    profileData ?? null,
    user,
  );

  // No profile yet — or a judge, who onboarded without the About step and is
  // asked for it now, the first time they apply as a participant.
  const needsAbout = profileData != null && profileData.universityId == null;
  if ((!hasProfile || needsAbout) && !previousApplication.success) {
    redirect(`/dashboard/profile?next=/dashboard/events/${segment}/apply`);
  }

  const hasEnded = hasEventElapsed(event.endsAt);
  const decisionIsFinal =
    applicationStatus != null && !canEditApplication(applicationStatus.status);
  const hasCustomQuestions = event.applicationQuestions.some(
    (question) => question.active && question.type !== 'section_divider',
  );

  // Submitting is refused server-side once the event is over, so a past
  // event never shows the form — just whatever status the user already has.
  if (hasEnded) {
    return (
      <div className='space-y-4'>
        <BreadcrumbSegment id={segment} label={event.name} />
        {applicationStatus ? (
          <ApplicationStatusBanner application={applicationStatus} standalone />
        ) : (
          <Card className='w-full sm:max-w-2xl'>
            <CardHeader>
              <CardTitle>Applications closed</CardTitle>
              <CardDescription>
                {event.name} has ended and is no longer accepting applications.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
        <div className='sm:max-w-2xl'>
          <Button asChild variant='outline' size='sm'>
            <Link href='/dashboard'>← Back to events</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (decisionIsFinal && applicationStatus) {
    return (
      <div className='space-y-4'>
        <ApplicationStatusBanner application={applicationStatus} standalone />
        <div className='sm:max-w-2xl'>
          <Button asChild variant='outline' size='sm'>
            <Link href='/dashboard/events'>← Back to events</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className='w-full sm:max-w-2xl'>
      <BreadcrumbSegment id={segment} label={event.name} />
      <CardHeader>
        <CardTitle>Application: {event.name}</CardTitle>
        <CardDescription>
          {hasCustomQuestions
            ? 'Review your profile and complete the event application below.'
            : 'Review your profile and submit your application for review.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-8'>
        {applicationStatus && (
          <ApplicationStatusBanner application={applicationStatus} />
        )}
        <section>
          <ProfileView profile={profileInitial} options={options} />
        </section>
        <section>
          <ApplicationForm
            initial={eventInitial}
            applicationQuestions={event.applicationQuestions}
            submitAction={submitEventApplication}
            eventId={eventId}
            submitLabel={
              applicationStatus ? 'Save changes' : 'Submit application'
            }
          />
        </section>
      </CardContent>
    </Card>
  );
}
