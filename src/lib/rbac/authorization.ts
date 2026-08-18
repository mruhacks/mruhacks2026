import { db } from '@/utils/db';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  permission,
  role,
  rolePermissions,
  userPermission,
  userRole,
} from '@/db/schema';
import { redirect } from 'next/navigation';
import { anyPermissionMatches } from './permissions';

export type RoleRow = {
  id: number;
  slug: string | null;
  description: string | null;
};
export type PermissionRow = {
  id: number;
  slug: string;
  description: string | null;
};

/** Internal RBAC lookups. Keep these outside server-action modules. */
export async function loadUserPermissions(
  userId: string,
): Promise<Set<string>> {
  const rows = await db.execute<{ slug: string }>(sql`
    SELECT p.slug FROM authz.permission p
    WHERE p.id IN (
      SELECT up.permission_id FROM authz.user_permission up WHERE up.user_id = ${userId}
      UNION
      SELECT rp.permission_id
        FROM authz.user_role ur
        JOIN authz.role_permission rp ON rp.role_id = ur.role_id
       WHERE ur.user_id = ${userId}
    )
  `);
  return new Set(rows.map((row) => row.slug));
}

export async function loadUserRoles(userId: string): Promise<RoleRow[]> {
  return db
    .select({ id: role.id, slug: role.slug, description: role.description })
    .from(userRole)
    .innerJoin(role, eq(userRole.roleId, role.id))
    .where(eq(userRole.userId, userId));
}

export async function loadDirectUserPermissions(
  userId: string,
): Promise<PermissionRow[]> {
  return db
    .select({
      id: permission.id,
      slug: permission.slug,
      description: permission.description,
    })
    .from(userPermission)
    .innerJoin(permission, eq(userPermission.permissionId, permission.id))
    .where(eq(userPermission.userId, userId));
}

export async function loadRolePermissions(
  roleId: number,
): Promise<PermissionRow[]> {
  return db
    .select({
      id: permission.id,
      slug: permission.slug,
      description: permission.description,
    })
    .from(rolePermissions)
    .innerJoin(permission, eq(rolePermissions.permissionId, permission.id))
    .where(eq(rolePermissions.roleId, roleId));
}

export async function loadRolesForUsers(
  userIds: string[],
): Promise<Record<string, { id: number; slug: string | null }[]>> {
  const result: Record<string, { id: number; slug: string | null }[]> = {};
  for (const userId of userIds) result[userId] = [];
  if (userIds.length === 0) return result;

  const rows = await db
    .select({ userId: userRole.userId, roleId: role.id, roleSlug: role.slug })
    .from(userRole)
    .innerJoin(role, eq(userRole.roleId, role.id))
    .where(inArray(userRole.userId, userIds));
  for (const row of rows)
    result[row.userId]!.push({ id: row.roleId, slug: row.roleSlug });
  return result;
}

export async function hasPermission(
  userId: string,
  permissionString: string,
): Promise<boolean> {
  return anyPermissionMatches(
    await loadUserPermissions(userId),
    permissionString,
  );
}

export async function hasAnyPermission(
  userId: string,
  permissionStrings: string[],
): Promise<boolean> {
  if (permissionStrings.length === 0) return true;
  const permissions = await loadUserPermissions(userId);
  return permissionStrings.some((required) =>
    anyPermissionMatches(permissions, required),
  );
}

export async function hasAllPermissions(
  userId: string,
  permissionStrings: string[],
): Promise<boolean> {
  const permissions = await loadUserPermissions(userId);
  return permissionStrings.every((required) =>
    anyPermissionMatches(permissions, required),
  );
}

export async function hasRole(
  userId: string,
  roleSlug: string,
): Promise<boolean> {
  return (await loadUserRoles(userId)).some((role) => role.slug === roleSlug);
}

export async function requirePermission(
  userId: string,
  permissionString: string,
): Promise<void> {
  if (!(await hasPermission(userId, permissionString))) {
    redirect(
      `/forbidden?reason=missing_permission&permission=${permissionString}`,
    );
  }
}

export async function requireAnyPermission(
  userId: string,
  permissionStrings: string[],
): Promise<void> {
  if (!(await hasAnyPermission(userId, permissionStrings))) {
    redirect(
      `/forbidden?reason=missing_permission&permission=${permissionStrings.join(',')}`,
    );
  }
}
