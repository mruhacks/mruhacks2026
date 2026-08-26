import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { sql } from 'drizzle-orm';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { user, role, permission, userRole } from '@/db/schema';
import { getAuthenticatedUserPermissions } from '@/lib/rbac/guards';
import { anyPermissionMatches } from '@/lib/rbac/permissions';
import { getEventsWithUserStatus } from '@/app/dashboard/events/actions';
import { EventTileList, SectionEyebrow } from '@/app/dashboard/events/EventTileList';
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

async function fetchAdminCounts() {
  const [userCount, roleCount, permCount, assignmentCount] = await Promise.all([
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(user),
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(role),
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(permission),
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(userRole),
  ]);
  return {
    users: userCount[0]?.c ?? 0,
    roles: roleCount[0]?.c ?? 0,
    permissions: permCount[0]?.c ?? 0,
    assignments: assignmentCount[0]?.c ?? 0,
  };
}

function AdminPanelSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className='animate-pulse' style={{ width: 48, height: 13, borderRadius: 3, background: 'var(--ink-200)' }} />
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {[...Array(4)].map((_, i) => (
          <div key={i} className='animate-pulse' style={{ height: 76, borderRadius: 'var(--radius-card)', background: 'var(--ink-100)' }} />
        ))}
      </div>
      <div className='animate-pulse' style={{ height: 44, borderRadius: 'var(--radius-card)', background: 'var(--ink-100)' }} />
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

  const counts = visibleStats.length > 0 ? await fetchAdminCounts() : null;

  return (
    <section className='space-y-3'>
      <SectionEyebrow color='var(--pink)'>Admin</SectionEyebrow>

      {visibleStats.length > 0 && (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          {visibleStats.map(({ label, countKey, icon: Icon, href }) => (
            <Link key={label} href={href}>
              <Card className='hover:border-primary/40 transition-colors'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-1 pt-3'>
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

export default async function Dashboard() {
  const currentUser = await getUser();
  if (!currentUser) redirect('/signin');

  const firstName = currentUser.name?.split(' ')[0] ?? null;
  const events = await getEventsWithUserStatus();

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
          Welcome back{firstName ? `, ${firstName}` : ''}
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

      {/* Events list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SectionEyebrow color='var(--black)'>My events</SectionEyebrow>
        <EventTileList events={events} />
      </div>

      {/* Admin panel — only renders for users with admin permissions */}
      <Suspense fallback={<AdminPanelSkeleton />}>
        <AdminSection />
      </Suspense>
    </div>
  );
}
