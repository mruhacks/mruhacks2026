'use server';

/**
 * Admin user-management server actions.
 *
 * Every mutating action here is guarded with `requirePermission`, so the
 * server-side RBAC checks the caller before touching anything. Read-only
 * listing likewise requires `user:read:all`.
 */

import { db } from '@/utils/db';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  or,
  sql,
  inArray,
} from 'drizzle-orm';
import {
  user,
  userRole,
  role,
  userPermission,
  permission,
  invite,
  account,
} from '@/db/schema';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { auth, getUser } from '@/utils/auth';
import { headers } from 'next/headers';
import {
  hasPermission,
  requirePermission,
  loadRolesForUsers,
} from '@/lib/rbac/authorization';
import { type RoleId, type PermissionId } from '@/app/actions/roles';
import {
  replaceUserDirectPermissions,
  replaceUserRoles,
} from '@/lib/rbac/role-mutations';
import { revalidatePath, updateTag } from 'next/cache';
import { serverActionError } from '@/utils/server-action-error';
import { writeAuditLog } from '@/utils/audit-log';
import { ADMIN_COUNTS_CACHE_TAG } from '@/lib/admin-counts';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type UserSortField = 'name' | 'email' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

export interface ListUsersParams {
  search?: string;
  roleSlugs?: string[];
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
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
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
      roleSlugs,
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

    if (roleSlugs && roleSlugs.length > 0) {
      // EXISTS avoids materialising a huge user-id IN list when a role
      // contains many members. inArray also parameterizes a single slug as
      // `IN ($1)` instead of passing it to PostgreSQL's array-only ANY().
      predicates.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(userRole)
            .innerJoin(role, eq(userRole.roleId, role.id))
            .where(
              and(eq(userRole.userId, user.id), inArray(role.slug, roleSlugs)),
            ),
        ) as ReturnType<typeof eq>,
      );
    }

    const whereClause = predicates.length ? and(...predicates) : undefined;

    const sortColumn =
      sortField === 'name'
        ? user.name
        : sortField === 'email'
          ? user.email
          : user.createdAt;
    const orderFn = sortDirection === 'asc' ? asc : desc;

    // Count + page fetch are independent — issue them in parallel.
    const [countRow, rows] = await Promise.all([
      db
        .select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(user)
        .where(whereClause ?? sql`true`),
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          createdAt: user.createdAt,
          banned: user.banned,
          banReason: user.banReason,
          banExpires: user.banExpires,
        })
        .from(user)
        .where(whereClause ?? sql`true`)
        .orderBy(orderFn(sortColumn))
        .limit(clampedPageSize)
        .offset((clampedPage - 1) * clampedPageSize),
    ]);
    const total = countRow[0]?.total ?? 0;

    const rolesMap = await loadRolesForUsers(rows.map((r) => r.id));

    const users: AdminUserRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      emailVerified: r.emailVerified,
      image: r.image,
      createdAt: r.createdAt,
      banned: Boolean(r.banned),
      banReason: r.banReason,
      banExpires: r.banExpires,
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
    return serverActionError('list users', e);
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

    // All three fetches are independent — run them in parallel.
    const [userRows, rolesRows, permRows] = await Promise.all([
      db
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
        .limit(1),
      db
        .select({
          id: role.id,
          slug: role.slug,
          description: role.description,
        })
        .from(userRole)
        .innerJoin(role, eq(userRole.roleId, role.id))
        .where(eq(userRole.userId, userId)),
      db
        .select({
          id: permission.id,
          slug: permission.slug,
          description: permission.description,
        })
        .from(userPermission)
        .innerJoin(permission, eq(userPermission.permissionId, permission.id))
        .where(eq(userPermission.userId, userId)),
    ]);

    const row = userRows[0];
    if (!row) return fail('User not found');

    return ok({
      ...row,
      roles: rolesRows,
      directPermissions: permRows,
    });
  } catch (e) {
    return serverActionError('load user', e);
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

    await replaceUserRoles(userId, roleIds);
    await writeAuditLog({
      actorId: caller.id,
      action: 'user.roles.updated',
      targetType: 'user',
      targetId: userId,
      metadata: { roleIds },
    });
    revalidatePath('/dashboard/admin/users');
    updateTag(ADMIN_COUNTS_CACHE_TAG);
    return ok();
  } catch (e) {
    return serverActionError('update user roles', e);
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

    await replaceUserDirectPermissions(userId, permissionIds);
    await writeAuditLog({
      actorId: caller.id,
      action: 'user.permissions.updated',
      targetType: 'user',
      targetId: userId,
      metadata: { permissionIds },
    });
    revalidatePath('/dashboard/admin/users');
    return ok();
  } catch (e) {
    return serverActionError('update user permissions', e);
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
    await writeAuditLog({
      actorId: caller.id,
      action: 'user.deleted',
      targetType: 'user',
      targetId: userId,
    });
    revalidatePath('/dashboard/admin/users');
    updateTag(ADMIN_COUNTS_CACHE_TAG);
    return ok();
  } catch (e) {
    return serverActionError('delete user', e);
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
    await writeAuditLog({
      actorId: caller.id,
      action: 'user.password.set',
      targetType: 'user',
      targetId: userId,
    });
    return ok();
  } catch (e) {
    return serverActionError('set password', e);
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
    return serverActionError('send password reset email', e);
  }
}

/**
 * Admin: invite a user by email with a preselected set of roles. Stores a
 * pending invite row keyed on the email, then triggers a magic-link sign-in
 * so Better Auth emails them a link. When they click it and land on /welcome,
 * the invite is consumed and the roles are applied.
 */
export async function inviteUser(
  email: string,
  roleIds: number[],
): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await requirePermission(caller.id, 'user:write:all');

    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      return fail('Enter a valid email');
    }

    await db
      .insert(invite)
      .values({
        email: normalized,
        roleIds,
        invitedBy: caller.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoUpdate({
        target: invite.email,
        set: {
          roleIds,
          invitedBy: caller.id,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

    await auth.api.signInMagicLink({
      body: {
        email: normalized,
        callbackURL: '/welcome?invited=1',
      },
      headers: await headers(),
    });
    await writeAuditLog({
      actorId: caller.id,
      action: 'user.invited',
      targetType: 'invite',
      targetId: normalized,
      metadata: { roleIds },
    });
    return ok();
  } catch (e) {
    return serverActionError('send invite', e);
  }
}

/**
 * Checks whether the currently signed-in user has a password set on any
 * credential account. Used on /welcome to decide whether to prompt for a
 * password after a magic-link sign-in.
 */
export async function currentUserHasPassword(): Promise<
  ActionResult<{ hasPassword: boolean }>
> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    const rows = await db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.userId, caller.id));
    const hasPassword = rows.some(
      (r) => typeof r.password === 'string' && r.password.length > 0,
    );
    return ok({ hasPassword });
  } catch (e) {
    return serverActionError('check password state', e);
  }
}

/**
 * Sets the signed-in user's display name. Used during onboarding to capture
 * the full name of a magic-link-invited user who signed up without one.
 */
export async function setOwnName(name: string): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    const trimmed = name.trim();
    if (trimmed.length === 0) return fail('Enter your name');
    if (trimmed.length > 200) return fail('Name is too long');
    await db.update(user).set({ name: trimmed }).where(eq(user.id, caller.id));
    return ok();
  } catch (e) {
    return serverActionError('save name', e);
  }
}

/**
 * Sets an initial password for the signed-in user when they don't yet have
 * a credential account (e.g. just signed in via magic link). Refuses to run
 * if they already have one — they should use change-password instead.
 */
export async function setInitialPassword(
  newPassword: string,
): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    if (newPassword.length < 12) {
      return fail('Password must be at least 12 characters');
    }

    const existing = await db
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.userId, caller.id),
          eq(account.providerId, 'credential'),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return fail('A password is already set on this account');
    }

    const ctx = await auth.$context;
    const hashedPassword = await ctx.password.hash(newPassword);
    await ctx.internalAdapter.createAccount({
      userId: caller.id,
      providerId: 'credential',
      accountId: caller.id,
      password: hashedPassword,
    });
    return ok();
  } catch (e) {
    return serverActionError('set password', e);
  }
}

/**
 * Server-side: consume a pending invite for the signed-in user. Applies the
 * role assignments the admin chose, then deletes the invite. Returns whether
 * an invite was consumed so the /welcome page can branch on it.
 */
export async function consumeInvite(): Promise<
  ActionResult<{ consumed: boolean }>
> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');

    const email = caller.email.toLowerCase();
    const [row] = await db
      .select({ roleIds: invite.roleIds, expiresAt: invite.expiresAt })
      .from(invite)
      .where(eq(invite.email, email))
      .limit(1);

    if (!row) return ok({ consumed: false });
    if (row.expiresAt <= new Date()) {
      await db.delete(invite).where(eq(invite.email, email));
      return ok({ consumed: false });
    }

    if (row.roleIds.length > 0) {
      await replaceUserRoles(caller.id, row.roleIds);
    }
    await db.delete(invite).where(eq(invite.email, email));
    revalidatePath('/dashboard/admin/users');
    updateTag(ADMIN_COUNTS_CACHE_TAG);
    return ok({ consumed: true });
  } catch (e) {
    return serverActionError('consume invite', e);
  }
}

/**
 * Admin: ban a user. `banExpiresIn` is in seconds (omit for a permanent ban).
 */
export async function adminBanUser(
  userId: string,
  banReason?: string,
  banExpiresIn?: number,
): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    if (caller.id === userId) return fail('You cannot ban your own account');
    await requirePermission(caller.id, 'user:write:all');

    const targetIsAdmin = await hasPermission(userId, 'user:all:all');
    const callerIsAdmin = await hasPermission(caller.id, 'user:all:all');
    if (targetIsAdmin && !callerIsAdmin) {
      return fail('You cannot ban an administrator');
    }

    await auth.api.banUser({
      body: {
        userId,
        banReason: banReason?.trim() || undefined,
        banExpiresIn: banExpiresIn ?? undefined,
      },
      headers: await headers(),
    });
    await writeAuditLog({
      actorId: caller.id,
      action: 'user.banned',
      targetType: 'user',
      targetId: userId,
      metadata: { banExpiresIn: banExpiresIn ?? null },
    });
    revalidatePath('/dashboard/admin/users');
    return ok();
  } catch (e) {
    return serverActionError('ban user', e);
  }
}

/**
 * Admin: lift a ban on a user.
 */
export async function adminUnbanUser(userId: string): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await requirePermission(caller.id, 'user:write:all');

    await auth.api.unbanUser({
      body: { userId },
      headers: await headers(),
    });
    await writeAuditLog({
      actorId: caller.id,
      action: 'user.unbanned',
      targetType: 'user',
      targetId: userId,
    });
    revalidatePath('/dashboard/admin/users');
    return ok();
  } catch (e) {
    return serverActionError('unban user', e);
  }
}

/**
 * Admin: revoke every active session for a user, forcing them to sign in again.
 */
export async function adminRevokeUserSessions(
  userId: string,
): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await requirePermission(caller.id, 'user:write:all');

    await auth.api.revokeUserSessions({
      body: { userId },
      headers: await headers(),
    });
    return ok();
  } catch (e) {
    return serverActionError('revoke user sessions', e);
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
    await writeAuditLog({
      actorId: caller.id,
      action: 'user.profile.updated',
      targetType: 'user',
      targetId: userId,
      metadata: { fields: Object.keys(changes) },
    });
    revalidatePath('/dashboard/admin/users');
    return ok();
  } catch (e) {
    return serverActionError('update user', e);
  }
}
