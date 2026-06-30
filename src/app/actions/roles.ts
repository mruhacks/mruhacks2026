'use server';

import { db } from '@/utils/db';
import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import {
  role,
  permission,
  rolePermissions,
  userRole,
  userPermission,
  user,
} from '@/db/schema';
import { ok, fail, type ActionResult } from '@/utils/action-result';

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
    return fail(`Failed to list roles: ${(e as Error).message}`);
  }
}

/**
 * Returns every registered permission.
 */
export async function listPermissions(): Promise<
  ActionResult<PermissionRow[]>
> {
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
    return fail(`Failed to list permissions: ${(e as Error).message}`);
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
  try {
    const [result] = await db
      .insert(role)
      .values({ slug, description })
      .onConflictDoNothing()
      .returning({ id: role.id });
    return ok(result?.id);
  } catch (e) {
    return fail(`Failed to create role: ${(e as Error).message}`);
  }
}

/**
 * Permanently removes a role by ID.
 */
export async function deleteRole(roleId: RoleId): Promise<ActionResult> {
  try {
    await db.delete(role).where(eq(role.id, roleId));
    return ok();
  } catch (e) {
    return fail(`Failed to delete role: ${(e as Error).message}`);
  }
}

/**
 * Updates the slug/description of an existing role.
 */
export async function updateRole(
  roleId: RoleId,
  patch: { slug?: string; description?: string | null },
): Promise<ActionResult> {
  try {
    const changes: Record<string, unknown> = {};
    if (typeof patch.slug === 'string') changes.slug = patch.slug.toLowerCase();
    if ('description' in patch) changes.description = patch.description ?? null;
    if (Object.keys(changes).length === 0) return ok();
    await db.update(role).set(changes).where(eq(role.id, roleId));
    return ok();
  } catch (e) {
    return fail(`Failed to update role: ${(e as Error).message}`);
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
  try {
    await db.insert(userRole).values({ userId, roleId }).onConflictDoNothing();
    return ok();
  } catch (e) {
    return fail(`Failed to assign role: ${(e as Error).message}`);
  }
}

/**
 * Removes a previously assigned role from a user.
 */
export async function revokeRoleFromUser(
  userId: string,
  roleId: RoleId,
): Promise<ActionResult> {
  try {
    await db
      .delete(userRole)
      .where(and(eq(userRole.userId, userId), eq(userRole.roleId, roleId)));
    return ok();
  } catch (e) {
    return fail(`Failed to revoke role: ${(e as Error).message}`);
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
  try {
    const [perm] = await db
      .insert(permission)
      .values({ slug: key, description })
      .onConflictDoNothing()
      .returning({ id: permission.id });
    return ok(perm?.id);
  } catch (e) {
    return fail(`Failed to add permission: ${(e as Error).message}`);
  }
}

/**
 * Deletes an existing permission by its ID.
 */
export async function deletePermission(
  permissionId: PermissionId,
): Promise<ActionResult> {
  try {
    await db.delete(permission).where(eq(permission.id, permissionId));
    return ok();
  } catch (e) {
    return fail(`Failed to delete permission: ${(e as Error).message}`);
  }
}

/**
 * Updates the slug/description of an existing permission.
 */
export async function updatePermission(
  permissionId: PermissionId,
  patch: { slug?: string; description?: string | null },
): Promise<ActionResult> {
  try {
    const changes: Record<string, unknown> = {};
    if (typeof patch.slug === 'string') changes.slug = patch.slug.toLowerCase();
    if ('description' in patch) changes.description = patch.description ?? null;
    if (Object.keys(changes).length === 0) return ok();
    await db
      .update(permission)
      .set(changes)
      .where(eq(permission.id, permissionId));
    return ok();
  } catch (e) {
    return fail(`Failed to update permission: ${(e as Error).message}`);
  }
}

/**
 * Grants a permission to a role.
 */
export async function grantPermissionToRole(
  roleId: RoleId,
  permissionId: PermissionId,
): Promise<ActionResult> {
  try {
    await db
      .insert(rolePermissions)
      .values({ roleId, permissionId })
      .onConflictDoNothing();
    return ok();
  } catch (e) {
    return fail(`Failed to grant permission: ${(e as Error).message}`);
  }
}

/**
 * Revokes a permission previously granted to a role.
 */
export async function revokePermissionFromRole(
  roleId: RoleId,
  permissionId: PermissionId,
): Promise<ActionResult> {
  try {
    await db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.permissionId, permissionId),
        ),
      );
    return ok();
  } catch (e) {
    return fail(`Failed to revoke permission: ${(e as Error).message}`);
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
  try {
    await db
      .insert(userPermission)
      .values({ userId, permissionId })
      .onConflictDoNothing();
    return ok();
  } catch (e) {
    return fail(`Failed to grant permission: ${(e as Error).message}`);
  }
}

/**
 * Revokes a direct user permission.
 */
export async function revokePermissionFromUser(
  userId: string,
  permissionId: PermissionId,
): Promise<ActionResult> {
  try {
    await db
      .delete(userPermission)
      .where(
        and(
          eq(userPermission.userId, userId),
          eq(userPermission.permissionId, permissionId),
        ),
      );
    return ok();
  } catch (e) {
    return fail(`Failed to revoke permission: ${(e as Error).message}`);
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
  try {
    await db.transaction(async (tx) => {
      await tx.delete(userRole).where(eq(userRole.userId, userId));
      if (roleIds.length > 0) {
        await tx
          .insert(userRole)
          .values(roleIds.map((roleId) => ({ userId, roleId })))
          .onConflictDoNothing();
      }

      // Sync user.role for the Better Auth admin plugin.
      // If the user has the 'admin' RBAC role, mark them as 'admin' in the
      // user table so the plugin recognises them as admins.
      const assignedRoles =
        roleIds.length > 0
          ? await tx
              .select({ slug: role.slug })
              .from(role)
              .where(inArray(role.id, roleIds))
          : [];
      const baRole = assignedRoles.some((r) => r.slug === 'admin')
        ? 'admin'
        : 'user';
      await tx.update(user).set({ role: baRole }).where(eq(user.id, userId));
    });
    return ok();
  } catch (e) {
    return fail(`Failed to set user roles: ${(e as Error).message}`);
  }
}

/**
 * Replaces the full set of direct user permissions with the given IDs.
 */
export async function setUserDirectPermissions(
  userId: string,
  permissionIds: PermissionId[],
): Promise<ActionResult> {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(userPermission).where(eq(userPermission.userId, userId));
      if (permissionIds.length > 0) {
        await tx
          .insert(userPermission)
          .values(
            permissionIds.map((permissionId) => ({ userId, permissionId })),
          )
          .onConflictDoNothing();
      }
    });
    return ok();
  } catch (e) {
    return fail(`Failed to set user permissions: ${(e as Error).message}`);
  }
}

/**
 * Replaces the set of permissions attached to a role.
 */
export async function setRolePermissions(
  roleId: RoleId,
  permissionIds: PermissionId[],
): Promise<ActionResult> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));
      if (permissionIds.length > 0) {
        await tx
          .insert(rolePermissions)
          .values(
            permissionIds.map((permissionId) => ({ roleId, permissionId })),
          )
          .onConflictDoNothing();
      }
    });
    return ok();
  } catch (e) {
    return fail(`Failed to set role permissions: ${(e as Error).message}`);
  }
}
