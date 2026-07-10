import { redirect } from 'next/navigation';

import { getUser } from '@/utils/auth';
import { getUserProfile, saveUserProfile } from './actions';
import { getOptions } from '@/app/dashboard/events/actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import ProfileForm from '@/components/profile-form';
import { ProfileAssets } from './profile-assets';

type DashboardProfilePageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function DashboardProfilePage({
  searchParams,
}: DashboardProfilePageProps) {
  const user = await getUser();
  if (!user) redirect('/signin');

  const { next } = await searchParams;

  const [profileResult, options] = await Promise.all([
    getUserProfile(),
    getOptions(),
  ]);

  const initial =
    profileResult.success && profileResult.data != null
      ? profileResult.data
      : { fullName: user.name };

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
        <ProfileAssets
          image={user.image}
          name={initial.fullName ?? user.name}
          hasResume={
            profileResult.success && profileResult.data?.hasResume === true
          }
          resumeFileName={
            profileResult.success
              ? (profileResult.data?.resumeFileName ?? null)
              : null
          }
        />
        <ProfileForm
          initial={initial}
          options={options}
          onSubmit={saveUserProfile}
          nextUrl={next}
        />
      </CardContent>
    </Card>
  );
}
