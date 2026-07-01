import { redirect } from 'next/navigation';
import Link from 'next/link';
import { sql } from 'drizzle-orm';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { user, role, permission, userRole } from '@/db/schema';
import { getEventsWithUserStatus } from '@/app/dashboard/events/actions';
import { getAuthenticatedUserPermissions } from '@/lib/rbac/guards';
import { anyPermissionMatches } from '@/lib/rbac/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ArrowRight,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  Users,
} from 'lucide-react';
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

function eventCtaLabel(e: EventWithUserStatus): string {
  if (!e.hasApplication) {
    return e.userStatus === 'registered' ? 'View' : 'Register';
  }
  if (!e.userStatus) return 'Apply';
  switch (e.statusKey) {
    case 'approved':
    case 'denied':
    case 'waitlisted':
      return 'View status';
    default:
      return 'Edit application';
  }
}

function EventStatusBadge({ e }: { e: EventWithUserStatus }) {
  if (e.statusDisplay) {
    return (
      <Badge variant={e.statusDisplay.variant}>{e.statusDisplay.title}</Badge>
    );
  }
  if (e.userStatus === 'registered') {
    return <Badge variant='success'>Registered</Badge>;
  }
  if (e.hasApplication) {
    return <Badge variant='outline'>Open to apply</Badge>;
  }
  return <Badge variant='outline'>Registration open</Badge>;
}

const QUICK_LINKS = ['Discord', 'Venue map', 'Schedule', 'Help desk'];

const RESOURCES = [
  { title: 'Getting started guide', sub: 'Setup, accounts & the basics' },
  { title: 'Rules & judging criteria', sub: 'How projects are scored' },
  { title: 'Code of conduct', sub: 'Keeping MRUHacks safe & kind' },
];

const ADMIN_PERMISSIONS = [
  'user:read:all',
  'user:all:all',
  'event:manage:all',
  'role:read:all',
  'permission:read:all',
];

// ── Admin panel ────────────────────────────────────────────────────────────────

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

async function AdminPanel() {
  const counts = await fetchAdminCounts();

  const stats = [
    { label: 'Users', value: counts.users, icon: Users, href: '/dashboard/admin/users' },
    { label: 'Roles', value: counts.roles, icon: ShieldCheck, href: '/dashboard/admin/roles' },
    { label: 'Permissions', value: counts.permissions, icon: KeyRound, href: '/dashboard/admin/permissions' },
    { label: 'Role assignments', value: counts.assignments, icon: Users, href: '/dashboard/admin/users' },
  ] as const;

  return (
    <section className='space-y-3'>
      <p className='text-muted-foreground text-xs font-semibold uppercase tracking-wider'>
        Admin
      </p>

      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className='hover:border-primary/40 transition-colors'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-1 pt-3'>
                <CardDescription className='text-xs'>{label}</CardDescription>
                <Icon className='text-muted-foreground size-3.5' />
              </CardHeader>
              <CardContent className='pb-3'>
                <div className='text-xl font-semibold'>
                  {value.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className='flex flex-wrap gap-2 py-3'>
          <Button asChild variant='outline' size='sm'>
            <Link href='/dashboard/admin/users'>
              Manage users <ArrowRight className='size-4' />
            </Link>
          </Button>
          <Button asChild variant='outline' size='sm'>
            <Link href='/dashboard/admin/events'>
              Manage events <ArrowRight className='size-4' />
            </Link>
          </Button>
          <Button asChild variant='outline' size='sm'>
            <Link href='/dashboard/admin/roles'>
              Manage roles <ArrowRight className='size-4' />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function Dashboard() {
  const currentUser = await getUser();
  if (!currentUser) redirect('/signin');

  const { permissions } = await getAuthenticatedUserPermissions();
  const isAdmin = ADMIN_PERMISSIONS.some((p) =>
    anyPermissionMatches(permissions, p),
  );

  const events = await getEventsWithUserStatus();
  const firstName = currentUser.name?.split(' ')[0] ?? null;

  return (
    <div className='space-y-8'>
      <div>
        <h1 className='text-2xl font-semibold'>
          Welcome back{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className='text-muted-foreground mt-1'>
          Track your applications, RSVPs and check-ins.
        </p>
      </div>

      <div className='grid gap-6 lg:grid-cols-[1.55fr_1fr]'>
        {/* Events list */}
        <div className='space-y-3'>
          <p className='text-muted-foreground text-xs font-semibold uppercase tracking-wider'>
            My events
          </p>

          {events.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>No events yet</CardTitle>
              </CardHeader>
              <CardContent className='text-muted-foreground text-sm'>
                Check back later — events will appear here once they&apos;re
                live.
              </CardContent>
            </Card>
          ) : (
            <ul className='space-y-2'>
              {events.map((event) => (
                <li key={event.id}>
                  <Card className='transition-shadow hover:shadow-sm'>
                    <CardContent className='flex items-center justify-between gap-3 p-4'>
                      <div className='min-w-0 flex-1'>
                        <p className='truncate font-semibold leading-tight'>
                          {event.name}
                        </p>
                        <p className='text-muted-foreground mt-0.5 text-sm'>
                          {event.hasApplication ? 'Application · ' : ''}
                          {formatDateRange(event.startsAt, event.endsAt)}
                        </p>
                      </div>
                      <div className='flex shrink-0 items-center gap-2'>
                        <EventStatusBadge e={event} />
                        <Button
                          asChild
                          size='sm'
                          variant={event.userStatus ? 'outline' : 'default'}
                        >
                          <Link href={`/dashboard/events/${event.id}`}>
                            {eventCtaLabel(event)}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Rail */}
        <aside className='space-y-4'>
          <Card>
            <CardHeader className='pb-2 pt-4'>
              <CardTitle className='text-muted-foreground text-xs font-semibold uppercase tracking-wider'>
                Quick links
              </CardTitle>
            </CardHeader>
            <CardContent className='grid grid-cols-2 gap-2 pb-4'>
              {QUICK_LINKS.map((l) => (
                <Button
                  key={l}
                  variant='secondary'
                  size='sm'
                  className='justify-start'
                >
                  {l}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2 pt-4'>
              <CardTitle className='text-muted-foreground text-xs font-semibold uppercase tracking-wider'>
                Resources
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 pb-4'>
              {RESOURCES.map((w) => (
                <div key={w.title} className='flex items-start gap-3'>
                  <ExternalLink className='text-muted-foreground mt-0.5 size-4 shrink-0' />
                  <div>
                    <p className='text-sm font-semibold leading-tight'>
                      {w.title}
                    </p>
                    <p className='text-muted-foreground text-xs'>{w.sub}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      {isAdmin && <AdminPanel />}
    </div>
  );
}
