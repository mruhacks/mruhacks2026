'use server';

import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import {
  role,
  permission,
  rolePermissions,
  userRole,
  userPermission,
} from '@/db/schema';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { redirect } from 'next/navigation';

type Scope = 'all' | 'any' | 'self' | { id: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Entity = 'user' | 'registration' | 'team' | 'submission';

// valid actions per entity
interface EntityActions {
  user: 'create' | 'read' | 'update' | 'delete';
  registration: 'approve' | 'reject' | 'read';
  team: 'create' | 'join' | 'manage';
  submission: 'submit' | 'review' | 'read';
}

// optional: more specific UUID type for readability
type UUID = `${string}-${string}-${string}-${string}-${string}`;

// flat permission strings for fixed scopes
type StaticScope = Exclude<Scope, { id: string }>;
type StaticPermission = {
  [E in keyof EntityActions]: `${E}:${EntityActions[E]}:${StaticScope}`;
}[keyof EntityActions];

// dynamic (instance-specific) permissions
type DynamicPermission = {
  [E in keyof EntityActions]: `${E}:${EntityActions[E]}:${UUID}`;
}[keyof EntityActions];

// combined union of all allowed permission strings
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PermissionString = StaticPermission | DynamicPermission;

/**
 * Checks if a permission string matches or is covered by another permission.
 * Supports hierarchical matching where "entity:all:all" covers all permissions for that entity.
 */
function permissionMatches(
  userPermission: string,
  requiredPermission: string,
): boolean {
  // Exact match
  if (userPermission === requiredPermission) {
    return true;
  }

  // Parse permissions: "entity:action:scope"
  const [userEntity, userAction, userScope] = userPermission.split(':');
  const [reqEntity] = requiredPermission.split(':');

  // Must be same entity
  if (userEntity !== reqEntity) {
    return false;
  }

  // If user has "entity:all:all", they have all permissions for that entity
  if (userAction === 'all' && userScope === 'all') {
    return true;
  }

  return false;
}

/**
 * Retrieves all permissions for a user, including:
 * - Direct user permissions
 * - Permissions inherited through roles
 *
 * @param userId - The user ID
 * @returns Set of permission strings
 */
export async function getUserPermissions(
  userId: string,
): Promise<ActionResult<Set<string>>> {
  try {
    const permissions = new Set<string>();

    // Get direct user permissions
    const directPerms = await db
      .select({ slug: permission.slug })
      .from(userPermission)
      .innerJoin(permission, eq(userPermission.permissionId, permission.id))
      .where(eq(userPermission.userId, userId));

    for (const perm of directPerms) {
      permissions.add(perm.slug);
    }

    // Get permissions through roles
    const rolePerms = await db
      .select({ slug: permission.slug })
      .from(userRole)
      .innerJoin(role, eq(userRole.roleId, role.id))
      .innerJoin(rolePermissions, eq(role.id, rolePermissions.roleId))
      .innerJoin(permission, eq(rolePermissions.permissionId, permission.id))
      .where(eq(userRole.userId, userId));

    for (const perm of rolePerms) {
      permissions.add(perm.slug);
    }

    return ok(permissions);
  } catch (e) {
    return fail(`Failed to get user permissions: ${(e as Error).message}`);
  }
}

/**
 * Checks if a user has a specific permission (exact or hierarchical match).
 *
 * @param userId - The user ID
 * @param permissionString - The permission to check (e.g., "submission:edit:self")
 * @returns true if the user has the permission, false otherwise
 */
export async function hasPermission(
  userId: string,
  permissionString: string,
): Promise<boolean> {
  const result = await getUserPermissions(userId);
  if (!result.success || !result.data) {
    return false;
  }

  // Check for exact or hierarchical match
  for (const userPerm of result.data) {
    if (permissionMatches(userPerm, permissionString)) {
      return true;
    }
  }

  return false;
}

/**
 * Requires a permission for a user. Redirects to /forbidden if the user doesn't have it.
 *
 * @param userId - The user ID
 * @param permissionString - The permission to check
 * @throws Redirects to /forbidden?reason=missing_permission if unauthorized
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
