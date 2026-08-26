import { db } from '@/utils/db';
import { eq, inArray } from 'drizzle-orm';
import {
  role,
  rolePermissions,
  user,
  userPermission,
  userRole,
} from '@/db/schema';

export async function replaceUserRoles(
  userId: string,
  roleIds: number[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userRole).where(eq(userRole.userId, userId));
    if (roleIds.length > 0) {
      await tx
        .insert(userRole)
        .values(roleIds.map((roleId) => ({ userId, roleId })))
        .onConflictDoNothing();
    }
    const assignedRoles =
      roleIds.length > 0
        ? await tx
            .select({ slug: role.slug })
            .from(role)
            .where(inArray(role.id, roleIds))
        : [];
    await tx
      .update(user)
      .set({
        role: assignedRoles.some((entry) => entry.slug === 'admin')
          ? 'admin'
          : 'user',
      })
      .where(eq(user.id, userId));
  });
}

export async function replaceUserDirectPermissions(
  userId: string,
  permissionIds: number[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userPermission).where(eq(userPermission.userId, userId));
    if (permissionIds.length > 0) {
      await tx
        .insert(userPermission)
        .values(permissionIds.map((permissionId) => ({ userId, permissionId })))
        .onConflictDoNothing();
    }
  });
}

export async function replaceRolePermissions(
  roleId: number,
  permissionIds: number[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (permissionIds.length > 0) {
      await tx
        .insert(rolePermissions)
        .values(permissionIds.map((permissionId) => ({ roleId, permissionId })))
        .onConflictDoNothing();
    }
  });
}
