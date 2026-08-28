import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';

import { getUser } from '@/utils/auth';
import {
  getOptions,
  getPreviousFormSubmission,
  getUserApplicationStatus,
  submitEventApplication,
} from '@/app/dashboard/events/actions';
import {
  getUserProfile,
  type UserProfileData,
} from '@/app/dashboard/profile/actions';
import { db } from '@/utils/db';
import { events } from '@/db/schema';
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
  const { eventId } = await params;
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
      getUserApplicationStatus(eventId),
    ]);

  const hasProfile = profileResult.success && profileResult.data != null;
  const profileData = hasProfile ? profileResult.data : null;
  const prev = previousApplication.success ? previousApplication.data : null;

  const { profileInitial, eventInitial } = buildApplyInitials(
    prev ?? null,
    profileData ?? null,
    user,
  );

  if (!hasProfile && !previousApplication.success) {
    redirect(`/dashboard/profile?next=/dashboard/events/${eventId}/apply`);
  }

  const decisionIsFinal =
    applicationStatus != null && applicationStatus.statusDisplay.isFinal;
  const hasCustomQuestions = event.applicationQuestions.some(
    (question) => question.active && question.type !== 'section_divider',
  );

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
      <BreadcrumbSegment id={eventId} label={event.name} />
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
