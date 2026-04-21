import { requireAuthWithPermission } from '@/lib/rbac/guards';
import { hasAnyPermission } from '@/app/actions/authz';
import { listUsers } from '@/app/actions/users';
import { listRoles, listPermissions } from '@/app/actions/roles';
import { UsersTable } from './users-table';

export default async function AdminUsersPage() {
  const caller = await requireAuthWithPermission([
    'user:read:all',
    'user:all:all',
  ]);

  const [usersRes, rolesRes, permsRes] = await Promise.all([
    listUsers({ page: 1, pageSize: 25 }),
    listRoles(),
    listPermissions(),
  ]);

  if (!usersRes.success || !usersRes.data) {
    return (
      <div className='text-destructive text-sm'>
        Failed to load users: {!usersRes.success ? usersRes.error : 'unknown'}
      </div>
    );
  }

  const roles =
    rolesRes.success && rolesRes.data
      ? rolesRes.data.map((r) => ({ id: r.id, slug: r.slug }))
      : [];
  const permissions = permsRes.success && permsRes.data ? permsRes.data : [];

  const canWrite = await hasAnyPermission(caller.id, [
    'user:write:all',
    'user:all:all',
  ]);

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>
          User management
        </h1>
        <p className='text-muted-foreground text-sm'>
          Search, filter, and manage every user in the system.
        </p>
      </div>

      <UsersTable
        initialData={usersRes.data}
        roles={roles}
        permissions={permissions}
        currentUserId={caller.id}
        canWrite={canWrite}
      />
    </div>
  );
}
