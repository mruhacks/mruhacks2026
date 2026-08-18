import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { sql } from 'drizzle-orm';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { user, role, permission, userRole } from '@/db/schema';
import { getEventsWithUserStatus } from '@/app/dashboard/events/actions';
import { getAuthenticatedUserPermissions } from '@/lib/rbac/guards';
import { anyPermissionMatches } from '@/lib/rbac/permissions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, KeyRound, ShieldCheck, Users } from 'lucide-react';
import type { EventWithUserStatus } from '@/app/dashboard/events/actions';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateRange(startsAt: Date | null, endsAt: Date | null) {
  if (!startsAt) return 'Date TBA';
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
  const start = fmt(startsAt);
  const end = endsAt ? fmt(endsAt) : null;
  return end && end !== start ? `${start} – ${end}` : start;
}

// ── Design system UI primitives ────────────────────────────────────────────────

function SectionEyebrow({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-ds-mono)',
        fontSize: '13px',
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        color,
      }}
    >
      {children}
    </span>
  );
}

function StatusPill({
  bg,
  fg,
  label,
}: {
  bg: string;
  fg: string;
  label: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 15px',
        borderRadius: 'var(--radius-pill)',
        background: bg,
        color: fg,
        fontFamily: 'var(--font-ui)',
        fontWeight: 'var(--fw-semibold)',
        fontSize: '14px',
        letterSpacing: 'var(--track-ui)',
        lineHeight: 1,
        whiteSpace: 'nowrap' as const,
      }}
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '999px',
          background: 'currentColor',
          display: 'block',
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  approved:       { bg: 'var(--green)',   fg: 'var(--white)' },
  denied:         { bg: 'var(--pink)',    fg: 'var(--white)' },
  waitlisted:     { bg: 'var(--orange)',  fg: 'var(--white)' },
  pending_review: { bg: 'var(--yellow)',  fg: 'var(--black)' },
};

function EventStatusPill({ e }: { e: EventWithUserStatus }) {
  if (e.statusKey && STATUS_COLORS[e.statusKey]) {
    const { bg, fg } = STATUS_COLORS[e.statusKey]!;
    return (
      <StatusPill bg={bg} fg={fg} label={e.statusDisplay?.title ?? e.statusKey} />
    );
  }
  if (e.userStatus === 'registered') {
    return <StatusPill bg='var(--blue)' fg='var(--white)' label='Registered' />;
  }
  if (e.hasApplication) {
    return (
      <StatusPill bg='var(--green)' fg='var(--white)' label='Open to apply' />
    );
  }
  return (
    <StatusPill bg='var(--green)' fg='var(--white)' label='Registration open' />
  );
}

// ── Admin permissions ──────────────────────────────────────────────────────────

/**
 * Each admin nav item is gated on its own direct permission, not a shared
 * "is this an admin" list — an item is visible only if the signed-in user
 * actually holds the permission it links to. See AGENTS.md: permissions,
 * not roles (and not vague admin-ness) gate UI.
 */
const ADMIN_STATS = [
  {
    label: 'Users',
    countKey: 'users',
    icon: Users,
    href: '/dashboard/admin/users',
    permission: 'user:read:all',
  },
  {
    label: 'Roles',
    countKey: 'roles',
    icon: ShieldCheck,
    href: '/dashboard/admin/roles',
    permission: 'role:read:all',
  },
  {
    label: 'Permissions',
    countKey: 'permissions',
    icon: KeyRound,
    href: '/dashboard/admin/permissions',
    permission: 'permission:read:all',
  },
  {
    label: 'Role assignments',
    countKey: 'assignments',
    icon: Users,
    href: '/dashboard/admin/users',
    permission: 'user:read:all',
  },
] as const;

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
] as const;

function hasAnyAdminAccess(permissions: Set<string>): boolean {
  return (
    ADMIN_STATS.some((s) => anyPermissionMatches(permissions, s.permission)) ||
    ADMIN_ACTIONS.some((a) => anyPermissionMatches(permissions, a.permission))
  );
}

async function fetchAdminCounts() {
  const u = await getUser();
  if (!u) redirect('/signin');
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function Dashboard() {
  const currentUser = await getUser();
  if (!currentUser) redirect('/signin');

  const [{ permissions }, events] = await Promise.all([
    getAuthenticatedUserPermissions(),
    getEventsWithUserStatus(),
  ]);

  const isAdmin = hasAnyAdminAccess(permissions);

  const firstName = currentUser.name?.split(' ')[0] ?? null;

  const tile: React.CSSProperties = {
    background: 'var(--white)',
    border: 'var(--border-hairline)',
    borderRadius: 'var(--radius-md)',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    boxShadow: 'var(--shadow-card)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Page header */}
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

        {events.length === 0 ? (
          <div style={tile}>
            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 'var(--fw-semibold)',
                fontSize: '16px',
                margin: 0,
              }}
            >
              No events yet
            </p>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--ink-500)',
                margin: 0,
              }}
            >
              Check back later — events will appear here once they&apos;re
              live.
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/dashboard/events/${event.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    background: 'var(--white)',
                    border: 'var(--border-hairline)',
                    borderRadius: 'var(--radius-md)',
                    padding: '18px 20px',
                    boxShadow: 'var(--shadow-card)',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        fontFamily: 'var(--font-ui)',
                        fontWeight: 'var(--fw-semibold)',
                        fontSize: '17px',
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {event.name}
                    </p>
                    <p
                      style={{
                        fontSize: '14px',
                        color: 'var(--ink-500)',
                        margin: '3px 0 0',
                      }}
                    >
                      {event.hasApplication ? 'Application · ' : ''}
                      {formatDateRange(event.startsAt, event.endsAt)}
                    </p>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      flexShrink: 0,
                    }}
                  >
                    <EventStatusPill e={event} />
                    <ArrowRight
                      className='text-muted-foreground size-4'
                      style={{ flexShrink: 0 }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isAdmin && (
        <Suspense fallback={<AdminPanelSkeleton />}>
          <AdminPanel permissions={permissions} />
        </Suspense>
      )}
    </div>
  );
}
