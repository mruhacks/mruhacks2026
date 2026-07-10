import { requireAuthWithPermission } from '@/lib/rbac/guards';
import { hasAnyPermission } from '@/lib/rbac/authorization';
import { listRoles, listPermissions } from '@/app/actions/roles';
import { RolesTable } from './roles-table';

export default async function AdminRolesPage() {
  const caller = await requireAuthWithPermission([
    'role:read:all',
    'role:write:all',
    'user:all:all',
  ]);

  const [rolesRes, permsRes] = await Promise.all([
    listRoles(),
    listPermissions(),
  ]);

  const canWrite = await hasAnyPermission(caller.id, [
    'role:write:all',
    'user:all:all',
  ]);

  if (!rolesRes.success || !rolesRes.data) {
    return (
      <div className='text-destructive text-sm'>
        Failed to load roles: {!rolesRes.success ? rolesRes.error : 'unknown'}
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>Roles</h1>
        <p className='text-muted-foreground text-sm'>
          Group permissions into reusable bundles you can assign to users.
        </p>
      </div>
      <RolesTable
        initialRoles={rolesRes.data}
        permissions={permsRes.success && permsRes.data ? permsRes.data : []}
        canWrite={canWrite}
      />
    </div>
  );
}
