'use server';

import { db } from '@/utils/db';
import { eq, and, asc, sql } from 'drizzle-orm';
import {
  role,
  permission,
  rolePermissions,
  userRole,
  userPermission,
} from '@/db/schema';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { getUser } from '@/utils/auth';
import { requirePermission } from '@/lib/rbac/authorization';
import {
  replaceRolePermissions,
  replaceUserDirectPermissions,
  replaceUserRoles,
} from '@/lib/rbac/role-mutations';
import { writeAuditLog } from '@/utils/audit-log';
import { serverActionError } from '@/utils/server-action-error';

async function authorize(permission: string) {
  const caller = await getUser();
  if (!caller) return false;
  await requirePermission(caller.id, permission);
  return true;
}

async function audit(
  action: string,
  targetType: string,
  targetId?: string | number,
  metadata?: Record<string, unknown>,
) {
  await writeAuditLog({
    actorId: (await getUser())?.id ?? null,
    action,
    targetType,
    targetId,
    metadata,
  });
}

/**
 * Canonical database identifier types.
 */
export type RoleId = number;
export type PermissionId = number;

export interface RoleWithCounts {
  id: RoleId;
  slug: string | null;
  description: string | null;
  permissionCount: number;
  userCount: number;
}

export interface PermissionRow {
  id: PermissionId;
  slug: string;
  description: string | null;
}

// ─────────────────────────────────────────────
// LIST QUERIES
// ─────────────────────────────────────────────

/**
 * Returns every role along with counts of permissions and users attached to it.
 */
export async function listRoles(): Promise<ActionResult<RoleWithCounts[]>> {
  if (!(await authorize('role:read:all'))) return fail('Not authenticated');
  try {
    // Correlated subqueries avoid the Cartesian product that a LEFT JOIN +
    // COUNT(DISTINCT) produces across millions of user_role rows.
    const roles = await db
      .select({
        id: role.id,
        slug: role.slug,
        description: role.description,
        permissionCount: sql<number>`(
          SELECT COUNT(*)::int FROM authz.role_permission rp
          WHERE rp.role_id = ${role.id}
        )`.mapWith(Number),
        userCount: sql<number>`(
          SELECT COUNT(*)::int FROM authz.user_role ur
          WHERE ur.role_id = ${role.id}
        )`.mapWith(Number),
      })
      .from(role)
      .orderBy(asc(role.slug));
    return ok(roles);
  } catch (e) {
    return serverActionError('list roles', e);
  }
}

/**
 * Returns every registered permission.
 */
export async function listPermissions(): Promise<
  ActionResult<PermissionRow[]>
> {
  if (!(await authorize('permission:read:all')))
    return fail('Not authenticated');
  try {
    const perms = await db
      .select({
        id: permission.id,
        slug: permission.slug,
        description: permission.description,
      })
      .from(permission)
      .orderBy(asc(permission.slug));
    return ok(perms);
  } catch (e) {
    return serverActionError('list permissions', e);
  }
}

// ─────────────────────────────────────────────
// ROLE MANAGEMENT
// ─────────────────────────────────────────────

/**
 * Creates a new role entry in the database.
 * TODO: Why is the column called slug in the db? why not just call it name?
 * @param slug - Unique role name (e.g., "admin", "judge")
 * @param description - Optional role description
 * @returns The new role ID, or undefined if it already existed
 */
export async function createRole(
  slug: string,
  description?: string,
): Promise<ActionResult<RoleId>> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    const [result] = await db
      .insert(role)
      .values({ slug, description })
      .onConflictDoNothing()
      .returning({ id: role.id });
    await audit('role.created', 'role', result?.id, { slug });
    return ok(result?.id);
  } catch (e) {
    return serverActionError('create role', e);
  }
}

/**
 * Permanently removes a role by ID.
 */
export async function deleteRole(roleId: RoleId): Promise<ActionResult> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    await db.delete(role).where(eq(role.id, roleId));
    await audit('role.deleted', 'role', roleId);
    return ok();
  } catch (e) {
    return serverActionError('delete role', e);
  }
}

/**
 * Updates the slug/description of an existing role.
 */
export async function updateRole(
  roleId: RoleId,
  patch: { slug?: string; description?: string | null },
): Promise<ActionResult> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    const changes: Record<string, unknown> = {};
    if (typeof patch.slug === 'string') changes.slug = patch.slug.toLowerCase();
    if ('description' in patch) changes.description = patch.description ?? null;
    if (Object.keys(changes).length === 0) return ok();
    await db.update(role).set(changes).where(eq(role.id, roleId));
    await audit('role.updated', 'role', roleId, {
      fields: Object.keys(changes),
    });
    return ok();
  } catch (e) {
    return serverActionError('update role', e);
  }
}

/**
 * Assigns an existing role to a user.
 *
 * @param userId - ID of the user
 * @param roleId - ID of the role to assign
 */
export async function assignRoleToUser(
  userId: string,
  roleId: RoleId,
): Promise<ActionResult> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    await db.insert(userRole).values({ userId, roleId }).onConflictDoNothing();
    await audit('role.assigned', 'user', userId, { roleId });
    return ok();
  } catch (e) {
    return serverActionError('assign role', e);
  }
}

/**
 * Removes a previously assigned role from a user.
 */
export async function revokeRoleFromUser(
  userId: string,
  roleId: RoleId,
): Promise<ActionResult> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    await db
      .delete(userRole)
      .where(and(eq(userRole.userId, userId), eq(userRole.roleId, roleId)));
    await audit('role.revoked', 'user', userId, { roleId });
    return ok();
  } catch (e) {
    return serverActionError('revoke role', e);
  }
}

// ─────────────────────────────────────────────
// PERMISSION MANAGEMENT
// ─────────────────────────────────────────────

/**
 * Registers a new permission key in the system.
 *
 * Example: `"submission:edit:self"`
 */
export async function addPermission(
  key: string,
  description?: string,
): Promise<ActionResult<PermissionId>> {
  if (!(await authorize('permission:write:all')))
    return fail('Not authenticated');
  try {
    const [perm] = await db
      .insert(permission)
      .values({ slug: key, description })
      .onConflictDoNothing()
      .returning({ id: permission.id });
    await audit('permission.created', 'permission', perm?.id, { slug: key });
    return ok(perm?.id);
  } catch (e) {
    return serverActionError('add permission', e);
  }
}

/**
 * Deletes an existing permission by its ID.
 */
export async function deletePermission(
  permissionId: PermissionId,
): Promise<ActionResult> {
  if (!(await authorize('permission:write:all')))
    return fail('Not authenticated');
  try {
    await db.delete(permission).where(eq(permission.id, permissionId));
    await audit('permission.deleted', 'permission', permissionId);
    return ok();
  } catch (e) {
    return serverActionError('delete permission', e);
  }
}

/**
 * Updates the slug/description of an existing permission.
 */
export async function updatePermission(
  permissionId: PermissionId,
  patch: { slug?: string; description?: string | null },
): Promise<ActionResult> {
  if (!(await authorize('permission:write:all')))
    return fail('Not authenticated');
  try {
    const changes: Record<string, unknown> = {};
    if (typeof patch.slug === 'string') changes.slug = patch.slug.toLowerCase();
    if ('description' in patch) changes.description = patch.description ?? null;
    if (Object.keys(changes).length === 0) return ok();
    await db
      .update(permission)
      .set(changes)
      .where(eq(permission.id, permissionId));
    await audit('permission.updated', 'permission', permissionId, {
      fields: Object.keys(changes),
    });
    return ok();
  } catch (e) {
    return serverActionError('update permission', e);
  }
}

/**
 * Grants a permission to a role.
 */
export async function grantPermissionToRole(
  roleId: RoleId,
  permissionId: PermissionId,
): Promise<ActionResult> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    await db
      .insert(rolePermissions)
      .values({ roleId, permissionId })
      .onConflictDoNothing();
    await audit('role.permission.granted', 'role', roleId, { permissionId });
    return ok();
  } catch (e) {
    return serverActionError('grant role permission', e);
  }
}

/**
 * Revokes a permission previously granted to a role.
 */
export async function revokePermissionFromRole(
  roleId: RoleId,
  permissionId: PermissionId,
): Promise<ActionResult> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    await db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.permissionId, permissionId),
        ),
      );
    await audit('role.permission.revoked', 'role', roleId, { permissionId });
    return ok();
  } catch (e) {
    return serverActionError('revoke role permission', e);
  }
}

/**
 * Grants a specific permission directly to a user.
 * (Bypasses role membership.)
 */
export async function grantPermissionToUser(
  userId: string,
  permissionId: PermissionId,
): Promise<ActionResult> {
  if (!(await authorize('permission:write:all')))
    return fail('Not authenticated');
  try {
    await db
      .insert(userPermission)
      .values({ userId, permissionId })
      .onConflictDoNothing();
    await audit('user.permission.granted', 'user', userId, { permissionId });
    return ok();
  } catch (e) {
    return serverActionError('grant user permission', e);
  }
}

/**
 * Revokes a direct user permission.
 */
export async function revokePermissionFromUser(
  userId: string,
  permissionId: PermissionId,
): Promise<ActionResult> {
  if (!(await authorize('permission:write:all')))
    return fail('Not authenticated');
  try {
    await db
      .delete(userPermission)
      .where(
        and(
          eq(userPermission.userId, userId),
          eq(userPermission.permissionId, permissionId),
        ),
      );
    await audit('user.permission.revoked', 'user', userId, { permissionId });
    return ok();
  } catch (e) {
    return serverActionError('revoke user permission', e);
  }
}

// ─────────────────────────────────────────────
// BULK SETTERS (replace-all semantics)
// ─────────────────────────────────────────────

/**
 * Replaces the full set of role assignments for a user with the given IDs.
 */
export async function setUserRoles(
  userId: string,
  roleIds: RoleId[],
): Promise<ActionResult> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    await replaceUserRoles(userId, roleIds);
    await audit('user.roles.replaced', 'user', userId, { roleIds });
    return ok();
  } catch (e) {
    return serverActionError('set user roles', e);
  }
}

/**
 * Replaces the full set of direct user permissions with the given IDs.
 */
export async function setUserDirectPermissions(
  userId: string,
  permissionIds: PermissionId[],
): Promise<ActionResult> {
  if (!(await authorize('permission:write:all')))
    return fail('Not authenticated');
  try {
    await replaceUserDirectPermissions(userId, permissionIds);
    await audit('user.permissions.replaced', 'user', userId, { permissionIds });
    return ok();
  } catch (e) {
    return serverActionError('set user permissions', e);
  }
}

/**
 * Replaces the set of permissions attached to a role.
 */
export async function setRolePermissions(
  roleId: RoleId,
  permissionIds: PermissionId[],
): Promise<ActionResult> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    await replaceRolePermissions(roleId, permissionIds);
    await audit('role.permissions.replaced', 'role', roleId, { permissionIds });
    return ok();
  } catch (e) {
    return serverActionError('set role permissions', e);
  }
}
