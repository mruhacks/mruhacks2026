'use server';

import { db } from '@/utils/db';
import { eq, asc, sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { getUser } from '@/utils/auth';
import * as Rbac from '@/lib/rbac/server';
import { writeAuditLog } from '@/utils/audit-log';
import { serverActionError } from '@/utils/server-action-error';
import { updateTag } from 'next/cache';
import { ADMIN_COUNTS_CACHE_TAG } from '@/lib/admin-counts';

async function authorize(permission: string) {
  const caller = await getUser();
  if (!caller) return false;
  await Rbac.requirePermission(caller.id, permission);
  return true;
}

/** See `grantDeniedReason`: refuses handing out permissions the caller lacks. */
async function grantDenied(grant: Parameters<typeof Rbac.grantDeniedReason>[1]): Promise<string | null> {
  const caller = await getUser();
  if (!caller) return 'Not authenticated';
  return Rbac.grantDeniedReason(caller.id, grant);
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
        id: schema.role.id,
        slug: schema.role.slug,
        description: schema.role.description,
        permissionCount: sql<number>`(
          SELECT COUNT(*)::int FROM authz.role_permission rp
          WHERE rp.role_id = ${schema.role.id}
        )`.mapWith(Number),
        userCount: sql<number>`(
          SELECT COUNT(*)::int FROM authz.user_role ur
          WHERE ur.role_id = ${schema.role.id}
        )`.mapWith(Number),
      })
      .from(schema.role)
      .orderBy(asc(schema.role.slug));
    return ok(roles);
  } catch (e) {
    return serverActionError('list roles', e);
  }
}

/**
 * Returns every registered permission.
 */
export async function listPermissions(): Promise<ActionResult<PermissionRow[]>> {
  if (!(await authorize('permission:read:all'))) return fail('Not authenticated');
  try {
    const perms = await db
      .select({
        id: schema.permission.id,
        slug: schema.permission.slug,
        description: schema.permission.description,
      })
      .from(schema.permission)
      .orderBy(asc(schema.permission.slug));
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
 * @param slug - Unique role name (e.g., "admin", "organizer")
 * @param description - Optional role description
 * @returns The new role ID, or undefined if it already existed
 */
export async function createRole(slug: string, description?: string): Promise<ActionResult<RoleId>> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    const [result] = await db
      .insert(schema.role)
      .values({ slug, description })
      .onConflictDoNothing()
      .returning({ id: schema.role.id });
    await audit('role.created', 'role', result?.id, { slug });
    updateTag(ADMIN_COUNTS_CACHE_TAG);
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
    await db.delete(schema.role).where(eq(schema.role.id, roleId));
    await audit('role.deleted', 'role', roleId);
    updateTag(ADMIN_COUNTS_CACHE_TAG);
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
    await db.update(schema.role).set(changes).where(eq(schema.role.id, roleId));
    await audit('role.updated', 'role', roleId, {
      fields: Object.keys(changes),
    });
    return ok();
  } catch (e) {
    return serverActionError('update role', e);
  }
}

/**
 * Deletes an existing permission by its ID.
 */
export async function deletePermission(permissionId: PermissionId): Promise<ActionResult> {
  if (!(await authorize('permission:write:all'))) return fail('Not authenticated');
  try {
    await db.delete(schema.permission).where(eq(schema.permission.id, permissionId));
    await audit('permission.deleted', 'permission', permissionId);
    updateTag(ADMIN_COUNTS_CACHE_TAG);
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
  if (!(await authorize('permission:write:all'))) return fail('Not authenticated');
  try {
    const changes: Record<string, unknown> = {};
    if (typeof patch.slug === 'string') changes.slug = patch.slug.toLowerCase();
    if ('description' in patch) changes.description = patch.description ?? null;
    if (Object.keys(changes).length === 0) return ok();
    // Renaming a permission changes what every holder of it is granted, so
    // the new slug is a grant like any other.
    if (typeof changes.slug === 'string') {
      const denied = await grantDenied({ permissionSlugs: [changes.slug] });
      if (denied) return fail(denied);
    }
    await db.update(schema.permission).set(changes).where(eq(schema.permission.id, permissionId));
    await audit('permission.updated', 'permission', permissionId, {
      fields: Object.keys(changes),
    });
    return ok();
  } catch (e) {
    return serverActionError('update permission', e);
  }
}

/**
 * Replaces the set of permissions attached to a role.
 */
export async function setRolePermissions(roleId: RoleId, permissionIds: PermissionId[]): Promise<ActionResult> {
  if (!(await authorize('role:write:all'))) return fail('Not authenticated');
  try {
    const current = new Set((await Rbac.loadRolePermissions(roleId)).map((p) => p.id));
    const denied = await grantDenied({
      permissionIds: permissionIds.filter((id) => !current.has(id)),
    });
    if (denied) return fail(denied);
    await Rbac.replaceRolePermissions(roleId, permissionIds);
    await audit('role.permissions.replaced', 'role', roleId, { permissionIds });
    return ok();
  } catch (e) {
    return serverActionError('set role permissions', e);
  }
}
