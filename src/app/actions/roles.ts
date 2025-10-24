"use server";

import { db } from "@/utils/db";
import { eq, and } from "drizzle-orm";
import {
  roles,
  permissions,
  rolePermissions,
  userRoles,
  userPermissions,
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
 *
 * @param name - Unique role name (e.g., "admin", "judge")
 * @param description - Optional role description
 * @returns The new role ID, or undefined if it already existed
 */
export async function createRole(
  name: string,
  description?: string,
): Promise<ActionResult<RoleId>> {
  try {
    const [role] = await db
      .insert(roles)
      .values({ name, description })
      .onConflictDoNothing()
      .returning({ id: roles.id });
    return ok(role?.id);
  } catch (e) {
    return fail(`Failed to create role: ${(e as Error).message}`);
  }
}

/**
 * Permanently removes a role by ID.
 */
export async function deleteRole(roleId: RoleId): Promise<ActionResult> {
  try {
    await db.delete(roles).where(eq(roles.id, roleId));
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
    await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
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
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
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
      .insert(permissions)
      .values({ key, description })
      .onConflictDoNothing()
      .returning({ id: permissions.id });
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
    await db.delete(permissions).where(eq(permissions.id, permissionId));
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
      .insert(userPermissions)
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
      .delete(userPermissions)
      .where(
        and(
          eq(userPermissions.userId, userId),
          eq(userPermissions.permissionId, permissionId),
        ),
      );
    return ok();
  } catch (e) {
    return fail(`Failed to revoke permission: ${(e as Error).message}`);
  }
}
