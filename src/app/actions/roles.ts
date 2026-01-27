"use server";

import { db } from "@/utils/db";
import { eq, and } from "drizzle-orm";
import {
  role,
  permission,
  rolePermissions,
  userRole,
  userPermission,
} from "@/db/schema";
import { ok, fail, type ActionResult } from "@/utils/action-result";

/**
 * Canonical database identifier types.
 */
export type RoleId = number;
export type PermissionId = number;

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
