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
import { AddToWalletButton } from '@/components/add-to-wallet-button';
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

// ── Quick links & resources ────────────────────────────────────────────────────

const QUICK_LINKS = ['Discord', 'Venue map', 'Schedule', 'Help desk'];

const RESOURCES = [
  {
    title: 'Getting started guide',
    sub: 'Setup, accounts & the basics',
    color: 'var(--tint-cyan)',
  },
  {
    title: 'Rules & judging criteria',
    sub: 'How projects are scored',
    color: 'var(--tint-orange)',
  },
  {
    title: 'Code of conduct',
    sub: 'Keeping MRUHacks safe & kind',
    color: 'var(--tint-lavender)',
  },
];

// ── Admin permissions ──────────────────────────────────────────────────────────

const ADMIN_PERMISSIONS = [
  'user:read:all',
  'user:all:all',
  'event:manage:all',
  'role:read:all',
  'permission:read:all',
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
      <SectionEyebrow color='var(--pink)'>Admin</SectionEyebrow>

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

  const [{ permissions }, events] = await Promise.all([
    getAuthenticatedUserPermissions(),
    getEventsWithUserStatus(),
  ]);

  const isAdmin = ADMIN_PERMISSIONS.some((p) =>
    anyPermissionMatches(permissions, p),
  );

  const firstName = currentUser.name?.split(' ')[0] ?? null;

  const ticketedEvents = events.filter((e) => e.statusKey === 'approved');

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

      {/* Main grid */}
      <div className='grid gap-6 lg:grid-cols-[1.55fr_1fr]'>
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
                    <div
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
                        <Button
                          asChild
                          size='sm'
                          variant={!event.userStatus ? 'gradient' : 'outline'}
                        >
                          <Link href={`/dashboard/events/${event.id}`}>
                            {eventCtaLabel(event)}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </li>
              ))}
            </ul>
          )}
        </div>

        {/* Rail */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {ticketedEvents.length > 0 && (
            <div style={tile}>
              <SectionEyebrow color='var(--green)'>Event pass</SectionEyebrow>
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--ink-500)',
                  margin: 0,
                }}
              >
                Add your ticket to Apple Wallet and show its QR code at
                check-in.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {ticketedEvents.map((event) => (
                  <div
                    key={event.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '7px',
                    }}
                  >
                    {ticketedEvents.length > 1 && (
                      <span
                        style={{
                          fontFamily: 'var(--font-ui)',
                          fontWeight: 'var(--fw-semibold)',
                          fontSize: '14px',
                          color: 'var(--black)',
                        }}
                      >
                        {event.name}
                      </span>
                    )}
                    <AddToWalletButton eventId={event.id} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick links */}
          <div style={tile}>
            <SectionEyebrow color='var(--pink)'>Quick links</SectionEyebrow>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
              }}
            >
              {QUICK_LINKS.map((l) => (
                <a
                  key={l}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '13px 14px',
                    borderRadius: 'var(--radius-card)',
                    background: 'var(--ink-050)',
                    fontFamily: 'var(--font-ui)',
                    fontWeight: 'var(--fw-semibold)',
                    fontSize: '14px',
                    color: 'var(--black)',
                    textDecoration: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {l}
                </a>
              ))}
            </div>
          </div>

          {/* Resources / wiki */}
          <div style={tile}>
            <SectionEyebrow color='var(--ultramarine)'>
              Wiki &amp; resources
            </SectionEyebrow>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {RESOURCES.map((w, i) => (
                <div
                  key={w.title}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 0',
                    borderTop:
                      i === 0 ? 'none' : 'var(--border-hairline)',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: w.color,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <p
                      style={{
                        fontFamily: 'var(--font-ui)',
                        fontWeight: 'var(--fw-semibold)',
                        fontSize: '14px',
                        color: 'var(--black)',
                        margin: 0,
                      }}
                    >
                      {w.title}
                    </p>
                    <p
                      style={{
                        fontSize: '12px',
                        color: 'var(--ink-500)',
                        margin: 0,
                      }}
                    >
                      {w.sub}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {isAdmin && (
        <Suspense fallback={<AdminPanelSkeleton />}>
          <AdminPanel />
        </Suspense>
      )}
    </div>
  );
}
