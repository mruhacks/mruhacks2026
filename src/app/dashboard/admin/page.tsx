import { Suspense } from 'react';
import Link from 'next/link';
import { getAdminCounts } from '@/lib/admin-counts';
import { requireAuthWithPermission } from '@/lib/rbac/guards';
import { loadUserPermissions } from '@/lib/rbac/authorization';
import {
  canOpenEventDashboard,
  EVENT_DASHBOARD_PERMISSIONS,
} from '@/lib/rbac/event-access';
import { anyPermissionMatches } from '@/lib/rbac/permissions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  CalendarDays,
} from 'lucide-react';

function OverviewSkeleton() {
  return (
    <>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className='bg-muted animate-pulse rounded-xl'
            style={{ height: 92 }}
          />
        ))}
      </div>
      <div
        className='bg-muted animate-pulse rounded-xl'
        style={{ height: 84 }}
      />
    </>
  );
}

/**
 * Each tile and button checks the permission its own page gates on, never a
 * shared bundle (see AGENTS.md). The events tile goes by whether the viewer
 * can see any part of an event dashboard, which is what the events list page
 * itself checks.
 */
const STAT_TILES = [
  {
    label: 'Events',
    countKey: 'events',
    icon: CalendarDays,
    href: '/dashboard/admin/events',
    visible: canOpenEventDashboard,
  },
  {
    label: 'Users',
    countKey: 'users',
    icon: Users,
    href: '/dashboard/admin/users',
    visible: (p: Set<string>) => anyPermissionMatches(p, 'user:read:all'),
  },
  {
    label: 'Roles',
    countKey: 'roles',
    icon: ShieldCheck,
    href: '/dashboard/admin/roles',
    visible: (p: Set<string>) => anyPermissionMatches(p, 'role:read:all'),
  },
  {
    label: 'Permissions',
    countKey: 'permissions',
    icon: KeyRound,
    href: '/dashboard/admin/permissions',
    visible: (p: Set<string>) => anyPermissionMatches(p, 'permission:read:all'),
  },
  {
    label: 'Role assignments',
    countKey: 'assignments',
    icon: Users,
    href: '/dashboard/admin/users',
    visible: (p: Set<string>) => anyPermissionMatches(p, 'user:read:all'),
  },
] as const;

const JUMP_LINKS = [
  {
    label: 'Manage events',
    href: '/dashboard/admin/events',
    visible: canOpenEventDashboard,
  },
  {
    label: 'Manage users',
    href: '/dashboard/admin/users',
    visible: (p: Set<string>) => anyPermissionMatches(p, 'user:read:all'),
  },
  {
    label: 'Manage roles',
    href: '/dashboard/admin/roles',
    visible: (p: Set<string>) => anyPermissionMatches(p, 'role:read:all'),
  },
  {
    label: 'Manage permissions',
    href: '/dashboard/admin/permissions',
    visible: (p: Set<string>) => anyPermissionMatches(p, 'permission:read:all'),
  },
] as const;

// Permission check + counts read the session and DB — kept out of the page
// body and behind Suspense so the heading ships in the shell immediately.
async function OverviewStats() {
  // Exactly the permissions behind the tiles below, so nobody who passes
  // this check ends up looking at an empty page.
  const caller = await requireAuthWithPermission([
    ...EVENT_DASHBOARD_PERMISSIONS,
    'user:read:all',
    'role:read:all',
    'permission:read:all',
  ]);
  const permissions = await loadUserPermissions(caller.id);

  const counts = await getAdminCounts();
  const stats = STAT_TILES.filter((tile) => tile.visible(permissions));
  const links = JUMP_LINKS.filter((link) => link.visible(permissions));

  return (
    <>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {stats.map(({ label, countKey, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className='hover:border-primary/40 transition-colors'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardDescription>{label}</CardDescription>
                <Icon className='text-muted-foreground size-4' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-semibold'>
                  {counts[countKey].toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Jump to</CardTitle>
          <CardDescription>Common admin tasks.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap gap-2'>
          {links.map((link) => (
            <Button key={link.href} asChild variant='outline' size='sm'>
              <Link href={link.href}>
                {link.label} <ArrowRight className='size-4' />
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

export default function AdminOverviewPage() {
  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>
          Admin overview
        </h1>
        <p className='text-muted-foreground text-sm'>
          Everything you have access to across the system.
        </p>
      </div>

      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewStats />
      </Suspense>
    </div>
  );
}
