'use server';

import { getUser } from '@/utils/auth';
import { fail, ok, type ActionResult } from '@/utils/action-result';
import * as Rbac from '@/lib/rbac/server';

async function mayReadAdministration(permission: string): Promise<boolean> {
  const caller = await getUser();
  return Boolean(caller && (await Rbac.hasPermission(caller.id, permission)));
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
