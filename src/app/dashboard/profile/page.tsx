import { redirect } from 'next/navigation';
import { InfoIcon } from 'lucide-react';

import { getUser } from '@/utils/auth';
import {
  getProfessionalProfile,
  getUserProfile,
  saveFullProfile,
} from './actions';
import { ProfessionalProfileForm } from './professional-profile-form';
import { isOnAnyJudgeRoster } from '@/lib/judging/server';
import { getOptions } from '@/app/dashboard/events/actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import ProfileForm from '@/components/profile-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { oauthPrefillName } from '@/lib/oauth-name';
import { sanitizeReturnPath } from '@/utils/return-path';

export default async function DashboardProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const user = await getUser();
  if (!user) redirect('/signin');

  // Set by an event's apply page when the student half is missing: after
  // saving, send the user back there. Only ever a same-origin path.
  const { next: rawNext } = await searchParams;
  const next =
    typeof rawNext === 'string'
      ? sanitizeReturnPath(rawNext, '') || undefined
      : undefined;

  const [profileResult, options, isJudge] = await Promise.all([
    getUserProfile(),
    getOptions(),
    // On any judging roster, past or present: they get the Professional
    // profile tab, and the student half becomes optional.
    isOnAnyJudgeRoster(user),
  ]);

  // Null for a judge, who onboards without the About step: the form asks
  // for it here, so normalize to `undefined` for ProfileForm's
  // Partial<ProfileFormValues> initial values.
  const initial =
    profileResult.success && profileResult.data != null
      ? {
          ...profileResult.data,
          universityId: profileResult.data.universityId ?? undefined,
          majorId: profileResult.data.majorId ?? undefined,
          yearOfStudyId: profileResult.data.yearOfStudyId ?? undefined,
        }
      : { fullName: oauthPrefillName(user.oauthName) };

  const professional = isJudge
    ? await getProfessionalProfile().then((result) =>
        result.success ? (result.data ?? null) : null,
      )
    : null;
  // A judge who has never filled in the student half lands on the half they
  // actually use.
  const hasPersonalDetails =
    profileResult.success && profileResult.data != null;
  const hasStudentDetails =
    profileResult.success && profileResult.data?.universityId != null;
  // Sent here from an event application that needs the student half first.
  const completingToApply = next != null && !hasStudentDetails;

  return (
    <Card className='w-full sm:max-w-2xl'>
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>
          {isJudge
            ? 'Your professional profile is shown to organizers when you judge. Your student profile is used when you apply to events as a hacker.'
            : 'Complete or update your profile. This information is used when you apply to events.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        {completingToApply && (
          <Alert>
            <InfoIcon />
            <AlertTitle>Complete your student profile to apply</AlertTitle>
            <AlertDescription>
              <p>
                Event applications use your student profile: your university,
                program and year of study.{' '}
                {hasPersonalDetails
                  ? 'Fill it in below and save'
                  : 'Fill in your personal details, then your student profile, and save'}
                , and we&apos;ll take you straight back to your application.
              </p>
              {isJudge && (
                <p>
                  Your student profile is separate from the professional profile
                  you use as a judge, and is only used when you apply to take
                  part in an event as a hacker.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
        <ProfileForm
          initial={initial}
          options={options}
          onSubmit={saveFullProfile}
          // Applying needs the student half, so it isn't optional on the
          // way there, even for a judge.
          aboutOptional={isJudge && next == null}
          successHref={next}
          hasResume={
            profileResult.success && profileResult.data?.hasResume === true
          }
          resumeFileName={
            profileResult.success
              ? (profileResult.data?.resumeFileName ?? null)
              : null
          }
          {...(isJudge && {
            aboutLabel: 'Student profile',
            defaultTab: hasStudentDetails ? 'personal' : 'professional',
            extraTab: {
              value: 'professional',
              label: 'Professional profile',
              content: <ProfessionalProfileForm initial={professional} />,
            },
          })}
          {...(completingToApply && {
            // With no profile at all, Personal comes first anyway.
            defaultTab: hasPersonalDetails ? 'about' : 'personal',
          })}
        />
      </CardContent>
    </Card>
  );
}
