import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { getUser } from '@/utils/auth';
import { getAdminCounts } from '@/lib/admin-counts';
import { getAuthenticatedUserPermissions } from '@/lib/rbac/guards';
import { anyPermissionMatches } from '@/lib/rbac/permissions';
import { getEventsWithUserStatus } from '@/app/dashboard/events/actions';
import {
  EventTileList,
  SectionEyebrow,
} from '@/app/dashboard/events/EventTileList';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, KeyRound, ShieldCheck, Users } from 'lucide-react';

/**
 * Each admin nav item is gated on its own direct permission, not a shared
 * "is this an admin" list. See AGENTS.md: permissions, not roles, gate UI.
 */
const ADMIN_STATS = [
  {
    label: 'Users',
    countKey: 'users' as const,
    icon: Users,
    href: '/dashboard/admin/users',
    permission: 'user:read:all',
  },
  {
    label: 'Roles',
    countKey: 'roles' as const,
    icon: ShieldCheck,
    href: '/dashboard/admin/roles',
    permission: 'role:read:all',
  },
  {
    label: 'Permissions',
    countKey: 'permissions' as const,
    icon: KeyRound,
    href: '/dashboard/admin/permissions',
    permission: 'permission:read:all',
  },
  {
    label: 'Role assignments',
    countKey: 'assignments' as const,
    icon: Users,
    href: '/dashboard/admin/users',
    permission: 'user:read:all',
  },
];

const ADMIN_ACTIONS = [
  {
    label: 'Manage users',
    href: '/dashboard/admin/users',
    permission: 'user:read:all',
  },
  {
    label: 'Manage events',
    href: '/dashboard/admin/events',
    permission: 'event:manage:all',
  },
  {
    label: 'Manage roles',
    href: '/dashboard/admin/roles',
    permission: 'role:read:all',
  },
];

function AdminPanelSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div
        className='animate-pulse'
        style={{
          width: 48,
          height: 13,
          borderRadius: 3,
          background: 'var(--ink-200)',
        }}
      />
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className='animate-pulse'
            style={{
              height: 76,
              borderRadius: 'var(--radius-card)',
              background: 'var(--ink-100)',
            }}
          />
        ))}
      </div>
      <div
        className='animate-pulse'
        style={{
          height: 44,
          borderRadius: 'var(--radius-card)',
          background: 'var(--ink-100)',
        }}
      />
    </div>
  );
}

async function AdminPanel({ permissions }: { permissions: Set<string> }) {
  const visibleStats = ADMIN_STATS.filter((s) =>
    anyPermissionMatches(permissions, s.permission),
  );
  const visibleActions = ADMIN_ACTIONS.filter((a) =>
    anyPermissionMatches(permissions, a.permission),
  );

  if (visibleStats.length === 0 && visibleActions.length === 0) return null;

  const counts = visibleStats.length > 0 ? await getAdminCounts() : null;

  return (
    <section className='space-y-3'>
      <SectionEyebrow color='var(--pink)'>Admin</SectionEyebrow>

      {visibleStats.length > 0 && (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          {visibleStats.map(({ label, countKey, icon: Icon, href }) => (
            <Link key={label} href={href}>
              <Card className='hover:border-primary/40 transition-colors'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pt-3 pb-1'>
                  <CardDescription className='text-xs'>{label}</CardDescription>
                  <Icon className='text-muted-foreground size-3.5' />
                </CardHeader>
                <CardContent className='pb-3'>
                  <div className='text-xl font-semibold'>
                    {(counts?.[countKey] ?? 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {visibleActions.length > 0 && (
        <Card>
          <CardContent className='flex flex-wrap gap-2 py-3'>
            {visibleActions.map(({ label, href }) => (
              <Button key={label} asChild variant='outline' size='sm'>
                <Link href={href}>
                  {label} <ArrowRight className='size-4' />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

async function AdminSection() {
  const { permissions } = await getAuthenticatedUserPermissions();

  const hasAnyAccess =
    ADMIN_STATS.some((s) => anyPermissionMatches(permissions, s.permission)) ||
    ADMIN_ACTIONS.some((a) => anyPermissionMatches(permissions, a.permission));

  if (!hasAnyAccess) return null;

  return <AdminPanel permissions={permissions} />;
}

// Reads the session — kept out of the page body and behind its own
// Suspense boundary so the static "Welcome back" heading ships in the
// shell immediately and only the name streams in behind it.
async function Greeting() {
  const currentUser = await getUser();
  if (!currentUser) redirect('/signin');
  const firstName = currentUser.name?.split(' ')[0] ?? null;
  return <>Welcome back{firstName ? `, ${firstName}` : ''}</>;
}

function EventsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
  );
}

// Fetches events and renders the "My events" list behind its own Suspense
// boundary so the page shell above ships immediately.
async function DashboardEvents() {
  const events = await getEventsWithUserStatus();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SectionEyebrow color='var(--black)'>My events</SectionEyebrow>
      <EventTileList events={events} />
    </div>
  );
}

export default function Dashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Welcome header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <SectionEyebrow color='var(--blue)'>Home</SectionEyebrow>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 'var(--fw-semibold)',
            fontSize: 'clamp(28px, 4vw, 40px)',
            lineHeight: 1.05,
            letterSpacing: 'var(--track-display)',
            margin: '4px 0 0',
          }}
        >
          <Suspense fallback='Welcome back'>
            <Greeting />
          </Suspense>
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '17px',
            lineHeight: 1.5,
            color: 'var(--ink-700)',
            margin: 0,
            maxWidth: '56ch',
          }}
        >
          Track your applications, RSVPs and check-ins.
        </p>
      </div>

      <Suspense fallback={<EventsSkeleton />}>
        <DashboardEvents />
      </Suspense>

      {/* Admin panel — only renders for users with admin permissions */}
      <Suspense fallback={<AdminPanelSkeleton />}>
        <AdminSection />
      </Suspense>
    </div>
  );
}
