'use server';

import { getUser } from '@/utils/auth';
import { fail, ok, type ActionResult } from '@/utils/action-result';
import * as Rbac from '@/lib/rbac/server';

async function mayInspectUser(targetUserId: string): Promise<boolean> {
  const caller = await getUser();
  return Boolean(caller && (caller.id === targetUserId || (await Rbac.hasPermission(caller.id, 'user:read:all'))));
}

async function mayReadAdministration(permission: string): Promise<boolean> {
  const caller = await getUser();
  return Boolean(caller && (await Rbac.hasPermission(caller.id, permission)));
}

/** Guarded client-facing lookup for a user's effective permissions. */
export async function getUserPermissions(userId: string): Promise<ActionResult<Set<string>>> {
  if (!(await mayInspectUser(userId))) return fail('Forbidden');
  try {
    return ok(await Rbac.loadUserPermissions(userId));
  } catch (error) {
    console.error('[authz] failed to load user permissions', error);
    return fail('Unable to load permissions');
  }
}

/** Guarded client-facing lookup for a user's roles. */
export async function getUserRoles(
  userId: string,
): Promise<ActionResult<{ id: number; slug: string | null; description: string | null }[]>> {
  if (!(await mayInspectUser(userId))) return fail('Forbidden');
  try {
    return ok(await Rbac.loadUserRoles(userId));
  } catch (error) {
    console.error('[authz] failed to load user roles', error);
    return fail('Unable to load roles');
  }
}

/** Guarded client-facing lookup for direct permissions. */
export async function getDirectUserPermissions(
  userId: string,
): Promise<ActionResult<{ id: number; slug: string; description: string | null }[]>> {
  if (!(await mayInspectUser(userId))) return fail('Forbidden');
  try {
    return ok(await Rbac.loadDirectUserPermissions(userId));
  } catch (error) {
    console.error('[authz] failed to load direct permissions', error);
    return fail('Unable to load permissions');
  }
}

/** Role-to-permission mappings are administrative data. */
export async function getRolePermissions(
  roleId: number,
): Promise<ActionResult<{ id: number; slug: string; description: string | null }[]>> {
  if (!(await mayReadAdministration('role:read:all'))) return fail('Forbidden');
  try {
    return ok(await Rbac.loadRolePermissions(roleId));
  } catch (error) {
    console.error('[authz] failed to load role permissions', error);
    return fail('Unable to load role permissions');
  }
}

/** Batch role lookup reserved for user administrators. */
export async function getRolesForUsers(
  userIds: string[],
): Promise<ActionResult<Record<string, { id: number; slug: string | null }[]>>> {
  if (!(await mayReadAdministration('user:read:all'))) return fail('Forbidden');
  try {
    return ok(await Rbac.loadRolesForUsers(userIds));
  } catch (error) {
    console.error('[authz] failed to load user roles', error);
    return fail('Unable to load roles');
  }
}
