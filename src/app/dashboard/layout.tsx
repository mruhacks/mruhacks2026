import { Suspense } from 'react';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { DashboardHeader } from '@/components/dashboard-header';
import { DashboardFooter } from '@/components/dashboard-footer';
import { BreadcrumbProvider } from '@/components/breadcrumb-context';
import { getUser } from '@/utils/auth';
import { getConsentStatus } from '@/app/dashboard/account/actions';
import { getUserProfile } from '@/app/dashboard/profile/actions';
import { redirect } from 'next/navigation';

export const instant = false;

// ── Skeletons ──────────────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div
      style={{
        borderBottom: 'var(--border-hairline)',
        background: 'var(--white)',
      }}
    >
      <div
        className='mx-auto flex w-full items-center justify-between p-4 sm:px-6'
        style={{ maxWidth: 'var(--content-max)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Logo: icon + wordmark */}
          <div
            className='animate-pulse'
            style={{ width: 128, height: 22, borderRadius: 6, background: 'var(--ink-100)' }}
          />
          {/* Breadcrumb: slash separator + one crumb label */}
          <div className='hidden sm:flex' style={{ alignItems: 'center' }}>
            <div style={{ width: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className='animate-pulse' style={{ width: 4, height: 14, borderRadius: 2, background: 'var(--ink-100)' }} />
            </div>
            <div className='animate-pulse' style={{ width: 76, height: 14, borderRadius: 4, background: 'var(--ink-100)' }} />
          </div>
        </div>
        <div
          className='animate-pulse'
          style={{ width: 38, height: 38, borderRadius: '999px', background: 'var(--ink-100)' }}
        />
      </div>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Welcome section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className='animate-pulse' style={{ width: 48, height: 13, borderRadius: 3, background: 'var(--ink-200)' }} />
        <div className='animate-pulse' style={{ width: 260, height: 36, borderRadius: 6, background: 'var(--ink-200)' }} />
        <div className='animate-pulse' style={{ width: 320, height: 16, borderRadius: 4, background: 'var(--ink-100)' }} />
      </div>
      {/* Events section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className='animate-pulse' style={{ width: 72, height: 13, borderRadius: 3, background: 'var(--ink-200)' }} />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className='animate-pulse'
            style={{
              height: 78,
              borderRadius: 'var(--radius-md)',
              background: 'var(--ink-100)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Server loader for the header ───────────────────────────────────────────────

async function DashboardHeaderLoader() {
  const user = await getUser();
  if (!user) redirect('/signin');

  // Bounce back into onboarding if it was never finished — e.g. the user
  // closed the tab mid-welcome-flow, or typed a dashboard URL directly.
  const [consentRes, profileRes] = await Promise.all([
    getConsentStatus(),
    getUserProfile(),
  ]);
  const needsConsent =
    consentRes.success && consentRes.data ? consentRes.data.needsConsent : true;
  const needsProfile = !profileRes.success || profileRes.data == null;
  if (needsConsent || needsProfile) redirect('/welcome');

  return (
    <DashboardHeader
      user={{
        name: user.name ?? '',
        email: user.email,
        avatar: user.image ?? undefined,
      }}
    />
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className='flex min-h-screen flex-col'
      style={{ background: 'var(--ink-050)', fontFamily: 'var(--font-body)' }}
    >
      <ImpersonationBanner />
      <BreadcrumbProvider>
        <Suspense fallback={<HeaderSkeleton />}>
          <DashboardHeaderLoader />
        </Suspense>
        <main
          className='mx-auto w-full flex-1 px-4 py-8 sm:px-6'
          style={{ maxWidth: 'var(--content-max)' }}
        >
          <Suspense fallback={<ContentSkeleton />}>
            {children}
          </Suspense>
        </main>
      </BreadcrumbProvider>
      <DashboardFooter />
    </div>
  );
}
