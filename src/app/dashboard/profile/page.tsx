import { redirect } from 'next/navigation';

import { getUser } from '@/utils/auth';
import { getUserProfile, saveFullProfile } from './actions';
import { getOptions } from '@/app/dashboard/events/actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import ProfileForm from '@/components/profile-form';
import { oauthPrefillName } from '@/lib/oauth-name';

export default async function DashboardProfilePage() {
  const user = await getUser();
  if (!user) redirect('/signin');

  const [profileResult, options] = await Promise.all([
    getUserProfile(),
    getOptions(),
  ]);

  // This page is only reachable once onboarding (including the About step)
  // is fully complete, so these are never actually null here in practice —
  // still, the type is nullable at the source, so normalize to `undefined`
  // for ProfileForm's Partial<ProfileFormValues> initial values.
  const initial =
    profileResult.success && profileResult.data != null
      ? {
          ...profileResult.data,
          universityId: profileResult.data.universityId ?? undefined,
          majorId: profileResult.data.majorId ?? undefined,
          yearOfStudyId: profileResult.data.yearOfStudyId ?? undefined,
        }
      : { fullName: oauthPrefillName(user.oauthName) };

  return (
    <Card className='w-full sm:max-w-2xl'>
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>
          Complete or update your profile. This information is used when you
          apply to events.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileForm
          initial={initial}
          options={options}
          onSubmit={saveFullProfile}
          hasResume={
            profileResult.success && profileResult.data?.hasResume === true
          }
          resumeFileName={
            profileResult.success
              ? (profileResult.data?.resumeFileName ?? null)
              : null
          }
        />
      </CardContent>
    </Card>
  );
}
