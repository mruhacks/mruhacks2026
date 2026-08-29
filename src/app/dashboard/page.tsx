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
import { AddToWalletButton } from '@/components/add-to-wallet-button';
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

// Fetches events once and renders both the "My events" list and the rail
// (event pass / quick links / resources) that depends on it, all behind one
// Suspense boundary so the page shell above ships immediately.
async function DashboardEvents() {
  const events = await getEventsWithUserStatus();
  const ticketedEvents = events.filter(
    (e) =>
      e.parentEventId === null &&
      (e.statusKey === 'approved' || e.userStatus === 'registered'),
  );

  return (
    <div className='grid gap-6 lg:grid-cols-[1.55fr_1fr]'>
      {/* Events list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SectionEyebrow color='var(--black)'>My events</SectionEyebrow>
        <EventTileList events={events} />
      </div>

      {/* Rail */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Event pass */}
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
                  borderTop: i === 0 ? 'none' : 'var(--border-hairline)',
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
