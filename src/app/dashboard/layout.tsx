import { Suspense } from 'react';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { DashboardHeader } from '@/components/dashboard-header';
import { getUser } from '@/utils/auth';
import { redirect } from 'next/navigation';

// ── Skeletons ──────────────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 28px',
        borderBottom: 'var(--border-hairline)',
        background: 'var(--white)',
      }}
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

      {/* Two-column grid */}
      <div className='grid gap-6 lg:grid-cols-[1.55fr_1fr]'>
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
        {/* Rail column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className='animate-pulse' style={{ height: 150, borderRadius: 'var(--radius-md)', background: 'var(--ink-100)' }} />
          <div className='animate-pulse' style={{ height: 178, borderRadius: 'var(--radius-md)', background: 'var(--ink-100)' }} />
        </div>
      </div>
    </div>
  );
}

// ── Server loader for the header ───────────────────────────────────────────────

async function DashboardHeaderLoader() {
  const user = await getUser();
  if (!user) redirect('/signin');

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
      className='min-h-screen'
      style={{ background: 'var(--ink-050)', fontFamily: 'var(--font-body)' }}
    >
      <ImpersonationBanner />
      <Suspense fallback={<HeaderSkeleton />}>
        <DashboardHeaderLoader />
      </Suspense>
      <main
        className='mx-auto px-4 py-8 sm:px-6'
        style={{ maxWidth: 'var(--content-max)' }}
      >
        <Suspense fallback={<ContentSkeleton />}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
