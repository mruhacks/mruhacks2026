import { redirect } from 'next/navigation';

import { getUser } from '@/utils/auth';
import { sanitizeInternalNextPath } from '@/utils/post-auth-redirect';
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

type Props = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function DashboardProfileContent({ searchParams }: Props) {
  const user = await getUser();
  if (!user) redirect('/signin');

  const { next } = await searchParams;
  const redirectAfterSave = sanitizeInternalNextPath(next);

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
        <ProfileForm
          initial={initial}
          options={options}
          onSubmit={saveUserProfile}
          redirectAfterSave={redirectAfterSave}
        />
      </CardContent>
    </Card>
  );
}
