import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';

import { requireAuthWithPermission } from '@/lib/rbac/guards';
import { getUserDetails } from '@/app/actions/users';
import { loadAssignableGrants } from '../assignable-grants';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EditUserFormStandalone } from './edit-user-form-standalone';

export default async function UserEditPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const caller = await requireAuthWithPermission([
    'user:write:all',
    'user:all:all',
  ]);

  const [userRes, { allRoles, allPermissions }] = await Promise.all([
    getUserDetails(userId),
    loadAssignableGrants(caller.id),
  ]);

  if (!userRes.success || !userRes.data) notFound();

  const { id, name, email, emailVerified, roles, directPermissions } =
    userRes.data;

  return (
    <div className='space-y-4'>
      <BreadcrumbSegment id={userId} label={name ?? email} />
      <div className='flex items-center gap-2'>
        <Button variant='ghost' size='sm' asChild>
          <Link href='/dashboard/admin/users'>
            <ChevronLeft className='size-4' />
            Users
          </Link>
        </Button>
      </div>

      <Card className='max-w-2xl'>
        <CardHeader>
          <CardTitle>Edit user</CardTitle>
          <CardDescription>
            Update profile details, roles, and direct permission grants for{' '}
            <span className='font-medium'>{email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditUserFormStandalone
            user={{ id, name, email, emailVerified, roles, directPermissions }}
            allRoles={allRoles}
            allPermissions={allPermissions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
