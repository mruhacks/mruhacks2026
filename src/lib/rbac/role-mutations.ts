import { db } from '@/utils/db';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';

export async function replaceUserRoles(userId: string, roleIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.userRole).where(eq(schema.userRole.userId, userId));
    if (roleIds.length > 0) {
      await tx
        .insert(schema.userRole)
        .values(roleIds.map((roleId) => ({ userId, roleId })))
        .onConflictDoNothing();
    }
    const assignedRoles =
      roleIds.length > 0
        ? await tx.select({ slug: schema.role.slug }).from(schema.role).where(inArray(schema.role.id, roleIds))
        : [];
    await tx
      .update(schema.user)
      .set({
        role: assignedRoles.some((entry) => entry.slug === 'admin') ? 'admin' : 'user',
      })
      .where(eq(schema.user.id, userId));
  });
}

export async function replaceUserDirectPermissions(userId: string, permissionIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.userPermission).where(eq(schema.userPermission.userId, userId));
    if (permissionIds.length > 0) {
      await tx
        .insert(schema.userPermission)
        .values(permissionIds.map((permissionId) => ({ userId, permissionId })))
        .onConflictDoNothing();
    }
  });
}

export async function replaceRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId));
    if (permissionIds.length > 0) {
      await tx
        .insert(schema.rolePermissions)
        .values(permissionIds.map((permissionId) => ({ roleId, permissionId })))
        .onConflictDoNothing();
    }
  });
}
