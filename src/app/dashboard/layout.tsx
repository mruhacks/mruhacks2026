import { Suspense } from 'react';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { DashboardHeader } from '@/components/dashboard-header';
import { DashboardFooter } from '@/components/dashboard-footer';
import { getUser } from '@/utils/auth';
import { getConsentStatus } from '@/app/dashboard/account/actions';
import { getUserProfile } from '@/app/dashboard/profile/actions';
import { redirect } from 'next/navigation';

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
        className='mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6'
        style={{ maxWidth: 'var(--content-max)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <div
            className='animate-pulse'
            style={{ width: 120, height: 22, borderRadius: 6, background: 'var(--ink-100)' }}
          />
          <div className='hidden sm:flex' style={{ gap: '26px' }}>
            <div className='animate-pulse' style={{ width: 40, height: 14, borderRadius: 4, background: 'var(--ink-100)' }} />
            <div className='animate-pulse' style={{ width: 50, height: 14, borderRadius: 4, background: 'var(--ink-100)' }} />
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
      {/* Page header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className='animate-pulse' style={{ width: 48, height: 13, borderRadius: 3, background: 'var(--ink-200)' }} />
        <div className='animate-pulse' style={{ width: 260, height: 36, borderRadius: 6, background: 'var(--ink-200)' }} />
        <div className='animate-pulse' style={{ width: 320, height: 16, borderRadius: 4, background: 'var(--ink-100)' }} />
      </div>

      {/* Events column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className='animate-pulse' style={{ width: 72, height: 13, borderRadius: 3, background: 'var(--ink-200)' }} />
        {[78, 78, 78].map((h, i) => (
          <div
            key={i}
            className='animate-pulse'
            style={{ height: h, borderRadius: 'var(--radius-md)', background: 'var(--ink-100)' }}
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
      <DashboardFooter />
    </div>
  );
}
