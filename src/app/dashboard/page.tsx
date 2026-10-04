import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { getUser } from '@/utils/auth';
import { getAdminCounts } from '@/lib/admin-counts';
import { adminEventPath } from '@/lib/event-slug';
import { getAuthenticatedUserPermissions } from '@/lib/rbac/guards';
import { anyPermissionMatches } from '@/lib/rbac/permissions';
import { getEventsWithUserStatus } from '@/app/dashboard/events/actions';
import {
  EventTileList,
  SectionEyebrow,
} from '@/app/dashboard/events/EventTileList';
import { Button } from '@/components/ui/button';
import { ArrowRight, ChevronRight } from 'lucide-react';

/**
 * Each admin tile is gated on its own direct permission — the one that gates
 * the page it links to — not a shared "is this an admin" list. See AGENTS.md:
 * permissions, not roles, gate UI.
 */
const ADMIN_TILES = [
  {
    label: 'Events',
    countKey: 'events' as const,
    unit: 'Event',
    href: '/dashboard/admin/events',
    permission: 'event:manage:all',
  },
  {
    label: 'Users',
    countKey: 'users' as const,
    unit: 'User',
    href: '/dashboard/admin/users',
    permission: 'user:read:all',
  },
];

/**
 * Roles and permissions ride along inside the Users tile as buttons. Each one
 * still checks the permission that gates its own page — and falls back to a
 * tile of its own when the user can't see the Users tile it normally sits in.
 */
const USER_TILE_LINKS = [
  {
    label: 'Roles',
    countKey: 'roles' as const,
    unit: 'Role',
    href: '/dashboard/admin/roles',
    permission: 'role:read:all',
  },
  {
    label: 'Permissions',
    countKey: 'permissions' as const,
    unit: 'Permission',
    href: '/dashboard/admin/permissions',
    permission: 'permission:read:all',
  },
];

/** The featured event's own tile links into its admin page, gated the same way. */
const FEATURED_EVENT_PERMISSION = 'event:manage:all';

/**
 * Buttons inside the featured event's tile. `path` deep-links to the tool's
 * own page under the event dashboard, and each one checks the permission
 * that page gates itself on. Applications aren't listed — the tile already
 * links to the event dashboard, where the applications table lives.
 */
const FEATURED_EVENT_LINKS = [
  {
    label: 'Check-in',
    path: 'checkin',
    permission: 'checkin:write:all',
  },
];

function pluralize(count: number, unit: string) {
  return count === 1 ? unit : `${unit}s`;
}

/** Outer "Admin" frame — hairline box wrapping the eyebrow and the tile row. */
const adminFrame: React.CSSProperties = {
  background: 'var(--white)',
  borderRadius: 'var(--radius-md)',
  padding: '18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  boxShadow: 'var(--shadow-card)',
};

const adminTileGrid: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
};

/**
 * A tile is one big click target, so the link is stretched over the whole
 * card rather than wrapping it — that leaves room for the nested buttons
 * some tiles carry (they sit above the overlay on their own stacking level).
 */
function AdminTile({
  label,
  value,
  unit,
  href,
  children,
}: {
  label: string;
  value: number;
  unit: string;
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className='border border-(--hairline) transition-colors hover:border-(--blue)'
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        borderRadius: 'var(--radius-card)',
        padding: '14px 16px',
        minWidth: 0,
      }}
    >
      <Link
        href={href}
        aria-label={label}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'var(--radius-card)',
        }}
      />

      <div
        style={{
          // Deliberately not grown to fill the tile: a tile without buttons
          // keeps its stat at the top, level with the ones that have them.
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 'var(--fw-semibold)',
              fontSize: '15px',
              letterSpacing: 'var(--track-ui)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--fw-semibold)',
              fontSize: '30px',
              lineHeight: 'var(--lh-tight)',
              letterSpacing: 'var(--track-display)',
              margin: '6px 0 0',
            }}
          >
            {value.toLocaleString()}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-ds-mono)',
              fontSize: '12px',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--ink-500)',
              margin: '6px 0 0',
            }}
          >
            {pluralize(value, unit)}
          </p>
        </div>
        <ArrowRight
          aria-hidden
          className='size-4 shrink-0'
          style={{ color: 'var(--ink-500)' }}
        />
      </div>

      {children && (
        // Sits above the stretched overlay link so these stay clickable.
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function AdminPanelSkeleton() {
  return (
    <div
      className='border border-(--hairline)'
      style={{ ...adminFrame, boxShadow: 'none' }}
    >
      <div
        className='animate-pulse'
        style={{
          width: 48,
          height: 13,
          borderRadius: 3,
          background: 'var(--ink-200)',
        }}
      />
      <div style={adminTileGrid}>
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className='animate-pulse'
            style={{
              height: 100,
              borderRadius: 'var(--radius-card)',
              background: 'var(--ink-100)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

async function AdminPanel({ permissions }: { permissions: Set<string> }) {
  const visibleTiles = ADMIN_TILES.filter((t) =>
    anyPermissionMatches(permissions, t.permission),
  );
  const canSeeUsers = anyPermissionMatches(permissions, 'user:read:all');
  const visibleUserLinks = USER_TILE_LINKS.filter((l) =>
    anyPermissionMatches(permissions, l.permission),
  );
  const canSeeFeaturedEvent = anyPermissionMatches(
    permissions,
    FEATURED_EVENT_PERMISSION,
  );

  const counts = await getAdminCounts();
  const featured = canSeeFeaturedEvent ? counts.featuredEvent : null;

  if (visibleTiles.length === 0 && visibleUserLinks.length === 0 && !featured) {
    return null;
  }

  return (
    <section
      className='border border-(--hairline)'
      style={adminFrame}
      aria-label='Admin'
    >
      <SectionEyebrow color='var(--pink)'>Admin</SectionEyebrow>

      <div style={adminTileGrid}>
        {/* The flagship event leads the row — its application count is the
            number admins check most often. */}
        {featured && (
          <AdminTile
            label={featured.name}
            value={featured.applications}
            unit='Application'
            href={adminEventPath(featured)}
          >
            {FEATURED_EVENT_LINKS.filter((link) =>
              anyPermissionMatches(permissions, link.permission),
            ).map((link) => (
              <Button key={link.label} asChild variant='outline' size='sm'>
                <Link href={`${adminEventPath(featured)}/${link.path}`}>
                  {link.label}
                </Link>
              </Button>
            ))}
          </AdminTile>
        )}
        {visibleTiles.map(({ label, countKey, unit, href }) => (
          <AdminTile
            key={label}
            label={label}
            value={counts[countKey]}
            unit={unit}
            href={href}
          >
            {label === 'Users' &&
              visibleUserLinks.map((link) => (
                <Button key={link.label} asChild variant='outline' size='sm'>
                  <Link href={link.href}>{link.label}</Link>
                </Button>
              ))}
          </AdminTile>
        ))}
        {/* Without the Users tile these buttons would have nowhere to live,
            so they get tiles of their own instead of vanishing. */}
        {!canSeeUsers &&
          visibleUserLinks.map(({ label, countKey, unit, href }) => (
            <AdminTile
              key={label}
              label={label}
              value={counts[countKey]}
              unit={unit}
              href={href}
            />
          ))}
      </div>
    </section>
  );
}

async function AdminSection() {
  const { permissions } = await getAuthenticatedUserPermissions();

  const hasAnyAccess =
    ADMIN_TILES.some((t) => anyPermissionMatches(permissions, t.permission)) ||
    USER_TILE_LINKS.some((l) =>
      anyPermissionMatches(permissions, l.permission),
    );

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
  const upcoming = events.filter((e) => !e.hasEnded);
  // Most recently finished first — the one someone is most likely looking
  // back on.
  const past = events
    .filter((e) => e.hasEnded)
    .sort((a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SectionEyebrow color='var(--black)'>My events</SectionEyebrow>
      <EventTileList events={upcoming} />
      {past.length > 0 && (
        // Collapsed by default: nothing on a past event can be acted on
        // anymore, so it shouldn't push the live ones down the page.
        <details className='group' style={{ marginTop: '8px' }}>
          <summary
            className='flex w-fit cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden'
            style={{ color: 'var(--ink-500)' }}
          >
            <ChevronRight
              aria-hidden
              className='size-4 transition-transform group-open:rotate-90'
            />
            <SectionEyebrow color='var(--ink-500)'>
              Past events ({past.length})
            </SectionEyebrow>
          </summary>
          <div style={{ marginTop: '12px' }}>
            <EventTileList events={past} />
          </div>
        </details>
      )}
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
