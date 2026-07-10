import { requireAuthWithPermission } from '@/lib/rbac/guards';
import { hasAnyPermission } from '@/lib/rbac/authorization';
import { listPermissions } from '@/app/actions/roles';
import { PermissionsTable } from './permissions-table';

export default async function AdminPermissionsPage() {
  const caller = await requireAuthWithPermission([
    'permission:read:all',
    'permission:write:all',
    'user:all:all',
  ]);

  const res = await listPermissions();
  const canWrite = await hasAnyPermission(caller.id, [
    'permission:write:all',
    'user:all:all',
  ]);

  if (!res.success || !res.data) {
    return (
      <div className='text-destructive text-sm'>
        Failed to load permissions: {!res.success ? res.error : 'unknown'}
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>Permissions</h1>
        <p className='text-muted-foreground text-sm'>
          Low-level permission slugs that back your roles. Format:{' '}
          <code className='font-mono'>entity:action:scope</code>.
        </p>
      </div>
      <PermissionsTable initialPermissions={res.data} canWrite={canWrite} />
    </div>
  );
}
