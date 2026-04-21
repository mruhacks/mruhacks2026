'use server';

import { db } from '@/utils/db';
import { eq, inArray } from 'drizzle-orm';
import {
  role,
  permission,
  rolePermissions,
  userRole,
  userPermission,
} from '@/db/schema';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { redirect } from 'next/navigation';
import {
  permissionMatches,
  anyPermissionMatches,
} from '@/lib/rbac/permissions';

/**
 * Retrieves all permissions for a user, including:
 *  - Direct user permissions
 *  - Permissions inherited through roles
 */
export async function getUserPermissions(
  userId: string,
): Promise<ActionResult<Set<string>>> {
  try {
    const permissions = new Set<string>();

    const directPerms = await db
      .select({ slug: permission.slug })
      .from(userPermission)
      .innerJoin(permission, eq(userPermission.permissionId, permission.id))
      .where(eq(userPermission.userId, userId));
    for (const p of directPerms) permissions.add(p.slug);

    const rolePerms = await db
      .select({ slug: permission.slug })
      .from(userRole)
      .innerJoin(role, eq(userRole.roleId, role.id))
      .innerJoin(rolePermissions, eq(role.id, rolePermissions.roleId))
      .innerJoin(permission, eq(rolePermissions.permissionId, permission.id))
      .where(eq(userRole.userId, userId));
    for (const p of rolePerms) permissions.add(p.slug);

    return ok(permissions);
  } catch (e) {
    return fail(`Failed to get user permissions: ${(e as Error).message}`);
  }
}

/**
 * Retrieves all roles assigned to a user.
 */
export async function getUserRoles(
  userId: string,
): Promise<
  ActionResult<
    { id: number; slug: string | null; description: string | null }[]
  >
> {
  try {
    const rows = await db
      .select({
        id: role.id,
        slug: role.slug,
        description: role.description,
      })
      .from(userRole)
      .innerJoin(role, eq(userRole.roleId, role.id))
      .where(eq(userRole.userId, userId));
    return ok(rows);
  } catch (e) {
    return fail(`Failed to get user roles: ${(e as Error).message}`);
  }
}

/**
 * Returns only the direct (user-level) permissions, not those granted via roles.
 */
export async function getDirectUserPermissions(
  userId: string,
): Promise<
  ActionResult<{ id: number; slug: string; description: string | null }[]>
> {
  try {
    const rows = await db
      .select({
        id: permission.id,
        slug: permission.slug,
        description: permission.description,
      })
      .from(userPermission)
      .innerJoin(permission, eq(userPermission.permissionId, permission.id))
      .where(eq(userPermission.userId, userId));
    return ok(rows);
  } catch (e) {
    return fail(`Failed to get direct permissions: ${(e as Error).message}`);
  }
}

/**
 * Returns all permissions assigned to a role.
 */
export async function getRolePermissions(
  roleId: number,
): Promise<
  ActionResult<{ id: number; slug: string; description: string | null }[]>
> {
  try {
    const rows = await db
      .select({
        id: permission.id,
        slug: permission.slug,
        description: permission.description,
      })
      .from(rolePermissions)
      .innerJoin(permission, eq(rolePermissions.permissionId, permission.id))
      .where(eq(rolePermissions.roleId, roleId));
    return ok(rows);
  } catch (e) {
    return fail(`Failed to get role permissions: ${(e as Error).message}`);
  }
}

/**
 * Efficient batch lookup: given a set of user IDs, return each user's roles.
 */
export async function getRolesForUsers(
  userIds: string[],
): Promise<
  ActionResult<Record<string, { id: number; slug: string | null }[]>>
> {
  try {
    if (userIds.length === 0) return ok({});
    const rows = await db
      .select({
        userId: userRole.userId,
        roleId: role.id,
        roleSlug: role.slug,
      })
      .from(userRole)
      .innerJoin(role, eq(userRole.roleId, role.id))
      .where(inArray(userRole.userId, userIds));

    const map: Record<string, { id: number; slug: string | null }[]> = {};
    for (const id of userIds) map[id] = [];
    for (const r of rows) {
      map[r.userId]!.push({ id: r.roleId, slug: r.roleSlug });
    }
    return ok(map);
  } catch (e) {
    return fail(`Failed to batch-load roles: ${(e as Error).message}`);
  }
}

/**
 * Checks if a user has a specific permission (exact or hierarchical match).
 */
export async function hasPermission(
  userId: string,
  permissionString: string,
): Promise<boolean> {
  const result = await getUserPermissions(userId);
  if (!result.success || !result.data) return false;
  return anyPermissionMatches(result.data, permissionString);
}

/**
 * Returns true if the user has at least one of the supplied permissions.
 */
export async function hasAnyPermission(
  userId: string,
  permissionStrings: string[],
): Promise<boolean> {
  if (permissionStrings.length === 0) return true;
  const result = await getUserPermissions(userId);
  if (!result.success || !result.data) return false;
  for (const required of permissionStrings) {
    if (anyPermissionMatches(result.data, required)) return true;
  }
  return false;
}

/**
 * Returns true only if the user has every one of the supplied permissions.
 */
export async function hasAllPermissions(
  userId: string,
  permissionStrings: string[],
): Promise<boolean> {
  if (permissionStrings.length === 0) return true;
  const result = await getUserPermissions(userId);
  if (!result.success || !result.data) return false;
  for (const required of permissionStrings) {
    if (!anyPermissionMatches(result.data, required)) return false;
  }
  return true;
}

/**
 * Returns true if the user has the supplied role slug.
 */
export async function hasRole(
  userId: string,
  roleSlug: string,
): Promise<boolean> {
  const rows = await db
    .select({ slug: role.slug })
    .from(userRole)
    .innerJoin(role, eq(userRole.roleId, role.id))
    .where(eq(userRole.userId, userId));
  return rows.some((r) => r.slug === roleSlug);
}

/**
 * Redirects to /forbidden if the user lacks a permission.
 */
export async function requirePermission(
  userId: string,
  permissionString: string,
): Promise<void> {
  const hasPerm = await hasPermission(userId, permissionString);
  if (!hasPerm) {
    redirect(
      `/forbidden?reason=missing_permission&permission=${permissionString}`,
    );
  }
}

/**
 * Redirects to /forbidden if the user lacks ALL of the supplied permissions.
 */
export async function requireAnyPermission(
  userId: string,
  permissionStrings: string[],
): Promise<void> {
  const ok = await hasAnyPermission(userId, permissionStrings);
  if (!ok) {
    redirect(
      `/forbidden?reason=missing_permission&permission=${permissionStrings.join(',')}`,
    );
  }
}

/**
 * Redirects to /forbidden if the user doesn't hold the given role.
 */
export async function requireRole(
  userId: string,
  roleSlug: string,
): Promise<void> {
  const ok = await hasRole(userId, roleSlug);
  if (!ok) {
    redirect(`/forbidden?reason=missing_role&role=${roleSlug}`);
  }
}

// Re-export the pure matcher so existing tests and callers keep working.
export { permissionMatches };
