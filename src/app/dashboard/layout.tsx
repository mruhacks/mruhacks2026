import { ImpersonationBanner } from '@/components/impersonation-banner';
import { DashboardHeader } from '@/components/dashboard-header';
import { getUser } from '@/utils/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect('/signin');

  return (
    <div className='min-h-screen bg-background'>
      <ImpersonationBanner />
      <DashboardHeader
        user={{
          name: user.name ?? '',
          email: user.email,
          avatar: user.image ?? undefined,
        }}
      />
      <main className='mx-auto max-w-screen-xl px-4 py-8 sm:px-6'>
        {children}
      </main>
    </div>
  );
}
