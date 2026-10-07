import { listPermissions, listRoles } from '@/app/actions/roles';
import { hasPermission } from '@/lib/rbac/authorization';

/**
 * The roles and permissions the edit-user form offers as checkboxes. Each
 * list is only loaded when the caller may read it (`listRoles` and
 * `listPermissions` redirect to /forbidden otherwise), and is null when they
 * can't, which hides that tab instead of failing the whole page.
 */
export async function loadAssignableGrants(callerId: string): Promise<{
  allRoles: { id: number; slug: string | null }[] | null;
  allPermissions:
    | { id: number; slug: string; description: string | null }[]
    | null;
}> {
  const [canReadRoles, canReadPermissions] = await Promise.all([
    hasPermission(callerId, 'role:read:all'),
    hasPermission(callerId, 'permission:read:all'),
  ]);
  const [rolesRes, permsRes] = await Promise.all([
    canReadRoles ? listRoles() : null,
    canReadPermissions ? listPermissions() : null,
  ]);
  return {
    allRoles:
      rolesRes?.success && rolesRes.data
        ? rolesRes.data.map((r) => ({ id: r.id, slug: r.slug }))
        : null,
    allPermissions: permsRes?.success && permsRes.data ? permsRes.data : null,
  };
}
