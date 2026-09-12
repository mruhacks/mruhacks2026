import { Suspense } from 'react';
import Link from 'next/link';
import { getAdminCounts } from '@/lib/admin-counts';
import { requireAuthWithPermission } from '@/lib/rbac/guards';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ShieldCheck, KeyRound, ArrowRight } from 'lucide-react';

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

// Permission check + counts read the session and DB — kept out of the page
// body and behind Suspense so the heading ships in the shell immediately.
async function OverviewStats() {
  await requireAuthWithPermission([
    'user:read:all',
    'user:all:all',
    'role:read:all',
    'permission:read:all',
    'event:manage:all',
  ]);

  const counts = await getAdminCounts();

  const stats = [
    {
      label: 'Users',
      value: counts.users,
      icon: Users,
      href: '/dashboard/admin/users',
    },
    {
      label: 'Roles',
      value: counts.roles,
      icon: ShieldCheck,
      href: '/dashboard/admin/roles',
    },
    {
      label: 'Permissions',
      value: counts.permissions,
      icon: KeyRound,
      href: '/dashboard/admin/permissions',
    },
    {
      label: 'Role assignments',
      value: counts.assignments,
      icon: Users,
      href: '/dashboard/admin/users',
    },
  ] as const;

  return (
    <>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className='hover:border-primary/40 transition-colors'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardDescription>{label}</CardDescription>
                <Icon className='text-muted-foreground size-4' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-semibold'>
                  {value.toLocaleString()}
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
          <Button asChild variant='outline' size='sm'>
            <Link href='/dashboard/admin/users'>
              Manage users <ArrowRight className='size-4' />
            </Link>
          </Button>
          <Button asChild variant='outline' size='sm'>
            <Link href='/dashboard/admin/roles'>
              Manage roles <ArrowRight className='size-4' />
            </Link>
          </Button>
          <Button asChild variant='outline' size='sm'>
            <Link href='/dashboard/admin/permissions'>
              Manage permissions <ArrowRight className='size-4' />
            </Link>
          </Button>
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
          Manage users, roles, and permissions across the system.
        </p>
      </div>

      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewStats />
      </Suspense>
    </div>
  );
}
