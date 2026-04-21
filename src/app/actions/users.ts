'use server';

/**
 * Admin user-management server actions.
 *
 * Every mutating action here is guarded with `requirePermission`, so the
 * server-side RBAC checks the caller before touching anything. Read-only
 * listing likewise requires `user:read:all`.
 */

import { db } from '@/utils/db';
import { and, asc, desc, eq, ilike, or, sql, inArray } from 'drizzle-orm';
import { user, userRole, role, userPermission } from '@/db/schema';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { auth, getUser } from '@/utils/auth';
import { headers } from 'next/headers';
import {
  hasPermission,
  requirePermission,
  getRolesForUsers,
} from '@/app/actions/authz';
import {
  setUserRoles,
  setUserDirectPermissions,
  type RoleId,
  type PermissionId,
} from '@/app/actions/roles';
import { revalidatePath } from 'next/cache';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type UserSortField = 'name' | 'email' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

export interface ListUsersParams {
  search?: string;
  roleSlug?: string;
  page?: number;
  pageSize?: number;
  sortField?: UserSortField;
  sortDirection?: SortDirection;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  roles: { id: number; slug: string | null }[];
}

export interface ListUsersResult {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─────────────────────────────────────────────
// LIST / READ
// ─────────────────────────────────────────────

/**
 * Paginated list of users with search, role-filter and sorting. Used by the
 * admin user management table.
 */
export async function listUsers(
  params: ListUsersParams = {},
): Promise<ActionResult<ListUsersResult>> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await requirePermission(caller.id, 'user:read:all');

    const {
      search = '',
      roleSlug,
      page = 1,
      pageSize = 25,
      sortField = 'createdAt',
      sortDirection = 'desc',
    } = params;

    const clampedPageSize = Math.min(Math.max(pageSize, 1), 200);
    const clampedPage = Math.max(page, 1);

    // Build predicates
    const predicates = [] as ReturnType<typeof eq>[];
    if (search.trim().length > 0) {
      const needle = `%${search.trim()}%`;
      predicates.push(
        or(ilike(user.name, needle), ilike(user.email, needle)) as ReturnType<
          typeof eq
        >,
      );
    }

    let userIdsByRole: string[] | null = null;
    if (roleSlug) {
      const rows = await db
        .select({ userId: userRole.userId })
        .from(userRole)
        .innerJoin(role, eq(userRole.roleId, role.id))
        .where(eq(role.slug, roleSlug));
      userIdsByRole = rows.map((r) => r.userId);
      if (userIdsByRole.length === 0) {
        return ok({
          users: [],
          total: 0,
          page: clampedPage,
          pageSize: clampedPageSize,
          totalPages: 0,
        });
      }
      predicates.push(inArray(user.id, userIdsByRole) as ReturnType<typeof eq>);
    }

    const whereClause = predicates.length ? and(...predicates) : undefined;

    const sortColumn =
      sortField === 'name'
        ? user.name
        : sortField === 'email'
          ? user.email
          : user.createdAt;
    const orderFn = sortDirection === 'asc' ? asc : desc;

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(user)
      .where(whereClause ?? sql`true`);

    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(whereClause ?? sql`true`)
      .orderBy(orderFn(sortColumn))
      .limit(clampedPageSize)
      .offset((clampedPage - 1) * clampedPageSize);

    const rolesRes = await getRolesForUsers(rows.map((r) => r.id));
    const rolesMap = rolesRes.success && rolesRes.data ? rolesRes.data : {};

    const users: AdminUserRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      emailVerified: r.emailVerified,
      image: r.image,
      createdAt: r.createdAt,
      roles: rolesMap[r.id] ?? [],
    }));

    const totalPages = Math.max(1, Math.ceil(total / clampedPageSize));

    return ok({
      users,
      total,
      page: clampedPage,
      pageSize: clampedPageSize,
      totalPages,
    });
  } catch (e) {
    return fail(`Failed to list users: ${(e as Error).message}`);
  }
}

/**
 * Returns detailed info about a single user: profile fields, roles and
 * direct permissions.
 */
export async function getUserDetails(userId: string): Promise<
  ActionResult<{
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
    roles: { id: number; slug: string | null; description: string | null }[];
    directPermissions: {
      id: number;
      slug: string;
      description: string | null;
    }[];
  }>
> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await requirePermission(caller.id, 'user:read:all');

    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!row) return fail('User not found');

    const rolesRows = await db
      .select({
        id: role.id,
        slug: role.slug,
        description: role.description,
      })
      .from(userRole)
      .innerJoin(role, eq(userRole.roleId, role.id))
      .where(eq(userRole.userId, userId));

    const permRows = await db
      .select({
        id: userPermission.permissionId,
        slug: sql<string>`permission.slug`.as('slug'),
        description: sql<string | null>`permission.description`.as(
          'description',
        ),
      })
      .from(userPermission)
      .innerJoin(
        sql`authz.permission AS permission`,
        sql`${userPermission.permissionId} = permission.id`,
      )
      .where(eq(userPermission.userId, userId));

    return ok({
      ...row,
      roles: rolesRows,
      directPermissions: permRows,
    });
  } catch (e) {
    return fail(`Failed to load user: ${(e as Error).message}`);
  }
}

// ─────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────

/**
 * Replaces all role assignments for a user.
 */
export async function updateUserRoles(
  userId: string,
  roleIds: RoleId[],
): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await requirePermission(caller.id, 'user:write:all');

    const res = await setUserRoles(userId, roleIds);
    if (!res.success) return res;
    revalidatePath('/dashboard/admin/users');
    return ok();
  } catch (e) {
    return fail(`Failed to update user roles: ${(e as Error).message}`);
  }
}

/**
 * Replaces all direct permissions for a user.
 */
export async function updateUserDirectPermissions(
  userId: string,
  permissionIds: PermissionId[],
): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await requirePermission(caller.id, 'user:write:all');

    const res = await setUserDirectPermissions(userId, permissionIds);
    if (!res.success) return res;
    revalidatePath('/dashboard/admin/users');
    return ok();
  } catch (e) {
    return fail(`Failed to update user permissions: ${(e as Error).message}`);
  }
}

/**
 * Deletes a user entirely (cascades to sessions, accounts, profile, roles,
 * permissions).
 */
export async function deleteUser(userId: string): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    if (caller.id === userId) return fail('You cannot delete your own account');

    await requirePermission(caller.id, 'user:write:all');

    // Refuse to delete a user that has higher-or-equal admin privileges unless
    // the caller is also admin.
    const targetIsAdmin = await hasPermission(userId, 'user:all:all');
    const callerIsAdmin = await hasPermission(caller.id, 'user:all:all');
    if (targetIsAdmin && !callerIsAdmin) {
      return fail('You cannot delete an administrator');
    }

    await db.delete(user).where(eq(user.id, userId));
    revalidatePath('/dashboard/admin/users');
    return ok();
  } catch (e) {
    return fail(`Failed to delete user: ${(e as Error).message}`);
  }
}

/**
 * Admin: set a user's password directly via the Better Auth admin plugin.
 * Requires the caller to have user:write:all and to be an admin in Better Auth
 * (user.role = 'admin').
 */
export async function adminSetUserPassword(
  userId: string,
  newPassword: string,
): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await requirePermission(caller.id, 'user:write:all');

    const res = await auth.api.setUserPassword({
      body: { userId, newPassword },
      headers: await headers(),
    });
    if (!res.status) return fail('Failed to set password');
    return ok();
  } catch (e) {
    return fail(`Failed to set password: ${(e as Error).message}`);
  }
}

/**
 * Admin: send a password reset email to a user.
 * Requires sendResetPassword to be configured in auth.ts.
 */
export async function adminSendPasswordReset(
  email: string,
): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await requirePermission(caller.id, 'user:write:all');

    await auth.api.requestPasswordReset({
      body: { email, redirectTo: '/reset-password' },
    });
    return ok();
  } catch (e) {
    return fail(`Failed to send reset email: ${(e as Error).message}`);
  }
}

/**
 * Updates editable fields on a user (name, emailVerified).
 */
export async function updateUserProfile(
  userId: string,
  patch: { name?: string; emailVerified?: boolean },
): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await requirePermission(caller.id, 'user:write:all');

    const changes: Record<string, unknown> = {};
    if (typeof patch.name === 'string' && patch.name.trim().length > 0) {
      changes.name = patch.name.trim();
    }
    if (typeof patch.emailVerified === 'boolean') {
      changes.emailVerified = patch.emailVerified;
    }
    if (Object.keys(changes).length === 0) return ok();

    await db.update(user).set(changes).where(eq(user.id, userId));
    revalidatePath('/dashboard/admin/users');
    return ok();
  } catch (e) {
    return fail(`Failed to update user: ${(e as Error).message}`);
  }
}
