import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BadgeCheck, MailWarning } from 'lucide-react';

import { getUser } from '@/utils/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAccountOverview, getConsent } from './actions';
import { DataExportCard } from './data-export-card';
import { ConsentCard } from './consent-card';
import { SessionsCard } from './sessions-card';
import { DeleteAccountCard } from './delete-account-card';

const PROVIDER_LABELS: Record<string, string> = {
  credential: 'Email & password',
  google: 'Google',
  github: 'GitHub',
};

export const metadata = {
  title: 'Account & Privacy — MRUHacks',
};

export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect('/signin');

  const [overviewResult, consentResult] = await Promise.all([
    getAccountOverview(),
    getConsent(),
  ]);

  const overview = overviewResult.success ? overviewResult.data : null;
  const consent =
    consentResult.success && consentResult.data
      ? consentResult.data
      : {
          marketingEmails: false,
          marketingConsentAt: null,
          termsVersion: null,
          termsAcceptedAt: null,
          privacyVersion: null,
          privacyAcceptedAt: null,
        };

  return (
    <div className='w-full max-w-2xl space-y-6'>
      <div className='space-y-1'>
        <h1 className='text-2xl font-semibold tracking-tight'>
          Account &amp; Privacy
        </h1>
        <p className='text-muted-foreground text-sm'>
          Manage your account, control how your data is used, and exercise your
          privacy rights.
        </p>
      </div>

      {/* Account overview */}
      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
          <CardDescription>
            The account you use to sign in to MRUHacks.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <div className='flex items-center justify-between gap-4'>
            <span className='text-muted-foreground'>Name</span>
            <span className='font-medium'>{overview?.name ?? user.name}</span>
          </div>
          <div className='flex items-center justify-between gap-4'>
            <span className='text-muted-foreground'>Email</span>
            <span className='flex items-center gap-2 font-medium'>
              {overview?.email ?? user.email}
              {(overview?.emailVerified ?? user.emailVerified) ? (
                <Badge variant='secondary' className='gap-1'>
                  <BadgeCheck className='size-3' /> Verified
                </Badge>
              ) : (
                <Badge variant='outline' className='gap-1'>
                  <MailWarning className='size-3' /> Unverified
                </Badge>
              )}
            </span>
          </div>
          {overview && (
            <>
              <div className='flex items-center justify-between gap-4'>
                <span className='text-muted-foreground'>Sign-in methods</span>
                <span className='flex flex-wrap justify-end gap-1'>
                  {overview.providers.length > 0 ? (
                    overview.providers.map((p) => (
                      <Badge key={p} variant='outline'>
                        {PROVIDER_LABELS[p] ?? p}
                      </Badge>
                    ))
                  ) : (
                    <span className='font-medium'>—</span>
                  )}
                </span>
              </div>
              <div className='flex items-center justify-between gap-4'>
                <span className='text-muted-foreground'>Member since</span>
                <span className='font-medium'>
                  {new Date(overview.createdAt).toLocaleDateString()}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ConsentCard initial={consent} />

      <SessionsCard />

      <DataExportCard />

      {/* Privacy rights & policy links */}
      <Card>
        <CardHeader>
          <CardTitle>Your privacy rights</CardTitle>
          <CardDescription>
            MRUHacks handles your personal information in line with Canadian
            privacy law (PIPEDA and Alberta&apos;s PIPA). You have the right to
            access, correct, and delete your data, and to withdraw consent at
            any time.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap gap-4 text-sm'>
          <Link href='/privacy' className='text-primary hover:underline'>
            Privacy Policy
          </Link>
          <Link href='/terms' className='text-primary hover:underline'>
            Terms of Service
          </Link>
          <Link
            href='/dashboard/profile'
            className='text-primary hover:underline'
          >
            Edit your profile
          </Link>
        </CardContent>
      </Card>

      <DeleteAccountCard />
    </div>
  );
}
