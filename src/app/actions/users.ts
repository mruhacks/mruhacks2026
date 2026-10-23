'use server';

/**
 * Admin user-management server actions.
 *
 * Every mutating action here is guarded with `requirePermission`, so the
 * server-side RBAC checks the caller before touching anything. Read-only
 * listing likewise requires `user:read:all`.
 */

import { db } from '@/utils/db';
import { and, asc, desc, eq, exists, ilike, notExists, or, sql, inArray } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { auth, getUser } from '@/utils/auth';
import { headers } from 'next/headers';
import * as Rbac from '@/lib/rbac/server';
import { type RoleId, type PermissionId } from './roles';
import { revalidatePath, updateTag } from 'next/cache';
import { serverActionError } from '@/utils/server-action-error';
import { writeAuditLog } from '@/utils/audit-log';
import { ADMIN_COUNTS_CACHE_TAG } from '@/lib/admin-counts';
import { prepareUserDeletion } from '@/lib/account-deletion';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

type UserSortField = 'name' | 'email' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export interface ListUsersParams {
  search?: string;
  roleSlugs?: string[];
  page?: number;
  pageSize?: number;
  sortField?: UserSortField;
  sortDirection?: SortDirection;
}

interface AdminInvite {
  id: string;
  expiresAt: Date;
  roles: { id: number; slug: string | null }[];
}

/**
 * One row of the admin users table: a real account, or (`kind: 'invite'`) an
 * invite sent to an email that has no account yet. A real account can also
 * carry an `invite` when it was invited after signing up.
 */
export interface AdminUserRow {
  kind: 'user' | 'invite';
  /** User id, or the invite id for `kind: 'invite'`. */
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
  invite: AdminInvite | null;
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
export async function listUsers(params: ListUsersParams = {}): Promise<ActionResult<ListUsersResult>> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await Rbac.requirePermission(caller.id, 'user:read:all');

    const { search = '', roleSlugs, page = 1, pageSize = 25, sortField = 'createdAt', sortDirection = 'desc' } = params;

    const clampedPageSize = Math.min(Math.max(pageSize, 1), 200);
    const clampedPage = Math.max(page, 1);

    // Users and pending invites (to emails with no account yet) are listed
    // together, so both get the same search, role filter, sort and paging.
    const needle = search.trim().length > 0 ? `%${search.trim()}%` : null;
    const filterRoles = roleSlugs && roleSlugs.length > 0 ? roleSlugs : null;

    const userPredicates = [];
    // invite.email is always stored lowercased (inviteUser normalizes it),
    // so only the user side needs lower().
    const invitePredicates = [
      notExists(
        db
          .select({ one: sql`1` })
          .from(schema.user)
          .where(sql`lower(${schema.user.email}) = ${schema.invite.email}`),
      ),
    ];
    if (needle) {
      userPredicates.push(or(ilike(schema.user.name, needle), ilike(schema.user.email, needle)));
      invitePredicates.push(ilike(schema.invite.email, needle));
    }
    if (filterRoles) {
      // EXISTS avoids materialising a huge user-id IN list when a role
      // contains many members. inArray also parameterizes a single slug as
      // `IN ($1)` instead of passing it to PostgreSQL's array-only ANY().
      userPredicates.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(schema.userRole)
            .innerJoin(schema.role, eq(schema.userRole.roleId, schema.role.id))
            .where(and(eq(schema.userRole.userId, schema.user.id), inArray(schema.role.slug, filterRoles))),
        ),
      );
      invitePredicates.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(schema.role)
            .where(and(sql`${schema.role.id} = any(${schema.invite.roleIds})`, inArray(schema.role.slug, filterRoles))),
        ),
      );
    }

    const combined = unionAll(
      db
        .select({
          kind: sql<'user' | 'invite'>`'user'`.as('kind'),
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
          emailVerified: schema.user.emailVerified,
          image: schema.user.image,
          createdAt: schema.user.createdAt,
          banned: schema.user.banned,
          banReason: schema.user.banReason,
          banExpires: schema.user.banExpires,
        })
        .from(schema.user)
        .where(and(...userPredicates)),
      db
        .select({
          kind: sql<'user' | 'invite'>`'invite'`.as('kind'),
          id: schema.invite.id,
          // No name yet: use the email so a name sort interleaves invites
          // instead of bunching them at one end. The table doesn't show it.
          name: sql<string>`${schema.invite.email}`.as('name'),
          email: schema.invite.email,
          emailVerified: sql<boolean>`false`.as('email_verified'),
          image: sql<string | null>`null`.as('image'),
          createdAt: schema.invite.createdAt,
          banned: sql<boolean | null>`false`.as('banned'),
          banReason: sql<string | null>`null`.as('ban_reason'),
          banExpires: sql<Date | null>`null`.as('ban_expires'),
        })
        .from(schema.invite)
        .where(and(...invitePredicates)),
    ).as('rows');

    const sortColumn =
      sortField === 'name' ? combined.name : sortField === 'email' ? combined.email : combined.createdAt;
    const orderFn = sortDirection === 'asc' ? asc : desc;

    // Count + page fetch are independent — issue them in parallel.
    const [countRow, rows] = await Promise.all([
      db.select({ total: sql<number>`COUNT(*)`.mapWith(Number) }).from(combined),
      db
        .select()
        .from(combined)
        .orderBy(orderFn(sortColumn), asc(combined.email))
        .limit(clampedPageSize)
        .offset((clampedPage - 1) * clampedPageSize),
    ]);
    const total = countRow[0]?.total ?? 0;

    const userIds = rows.filter((r) => r.kind === 'user').map((r) => r.id);
    const inviteIds = rows.filter((r) => r.kind === 'invite').map((r) => r.id);
    const userEmails = rows.filter((r) => r.kind === 'user').map((r) => r.email.toLowerCase());

    const [rolesMap, inviteRows] = await Promise.all([
      Rbac.loadRolesForUsers(userIds),
      rows.length > 0
        ? db
            .select({
              id: schema.invite.id,
              email: schema.invite.email,
              roleIds: schema.invite.roleIds,
              expiresAt: schema.invite.expiresAt,
            })
            .from(schema.invite)
            .where(
              or(
                inviteIds.length > 0 ? inArray(schema.invite.id, inviteIds) : undefined,
                userEmails.length > 0 ? inArray(schema.invite.email, userEmails) : undefined,
              ) ?? sql`false`,
            )
        : [],
    ]);

    const inviteRoleIds = [...new Set(inviteRows.flatMap((i) => i.roleIds))];
    const inviteRoles =
      inviteRoleIds.length > 0
        ? await db
            .select({ id: schema.role.id, slug: schema.role.slug })
            .from(schema.role)
            .where(inArray(schema.role.id, inviteRoleIds))
        : [];
    const toInvite = (i: (typeof inviteRows)[number]): AdminInvite => ({
      id: i.id,
      expiresAt: i.expiresAt,
      // A role deleted since the invite was sent simply drops out.
      roles: inviteRoles.filter((r) => i.roleIds.includes(r.id)),
    });
    const inviteById = new Map(inviteRows.map((i) => [i.id, toInvite(i)]));
    const inviteByEmail = new Map(inviteRows.map((i) => [i.email, inviteById.get(i.id)!]));

    const users: AdminUserRow[] = rows.map((r) => ({
      kind: r.kind,
      id: r.id,
      name: r.name,
      email: r.email,
      emailVerified: r.emailVerified,
      image: r.image,
      createdAt: r.createdAt,
      banned: Boolean(r.banned),
      banReason: r.banReason,
      banExpires: r.banExpires,
      roles: r.kind === 'user' ? (rolesMap[r.id] ?? []) : [],
      invite: (r.kind === 'invite' ? inviteById.get(r.id) : inviteByEmail.get(r.email.toLowerCase())) ?? null,
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
    await Rbac.requirePermission(caller.id, 'user:read:all');

    // All three fetches are independent — run them in parallel.
    const [userRows, rolesRows, permRows] = await Promise.all([
      db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
          emailVerified: schema.user.emailVerified,
          image: schema.user.image,
          createdAt: schema.user.createdAt,
          updatedAt: schema.user.updatedAt,
        })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1),
      db
        .select({
          id: schema.role.id,
          slug: schema.role.slug,
          description: schema.role.description,
        })
        .from(schema.userRole)
        .innerJoin(schema.role, eq(schema.userRole.roleId, schema.role.id))
        .where(eq(schema.userRole.userId, userId)),
      db
        .select({
          id: schema.permission.id,
          slug: schema.permission.slug,
          description: schema.permission.description,
        })
        .from(schema.userPermission)
        .innerJoin(schema.permission, eq(schema.userPermission.permissionId, schema.permission.id))
        .where(eq(schema.userPermission.userId, userId)),
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
export async function updateUserRoles(userId: string, roleIds: RoleId[]): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await Rbac.requirePermission(caller.id, 'user:write:all');

    const current = new Set((await Rbac.loadUserRoles(userId)).map((r) => r.id));
    const denied = await Rbac.grantDeniedReason(caller.id, {
      roleIds: roleIds.filter((id) => !current.has(id)),
    });
    if (denied) return fail(denied);

    await Rbac.replaceUserRoles(userId, roleIds);
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
    await Rbac.requirePermission(caller.id, 'user:write:all');

    const current = new Set((await Rbac.loadDirectUserPermissions(userId)).map((p) => p.id));
    const denied = await Rbac.grantDeniedReason(caller.id, {
      permissionIds: permissionIds.filter((id) => !current.has(id)),
    });
    if (denied) return fail(denied);

    await Rbac.replaceUserDirectPermissions(userId, permissionIds);
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

    await Rbac.requirePermission(caller.id, 'user:write:all');

    // Refuse to delete a user that has higher-or-equal admin privileges unless
    // the caller is also admin.
    const targetIsAdmin = await Rbac.hasPermission(userId, 'user:all:all');
    const callerIsAdmin = await Rbac.hasPermission(caller.id, 'user:all:all');
    if (targetIsAdmin && !callerIsAdmin) {
      return fail('You cannot delete an administrator');
    }

    await prepareUserDeletion(userId);
    await db.delete(schema.user).where(eq(schema.user.id, userId));
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
 * Compliance "full wipe": erases a user's account and personal data on an
 * erasure request, the same way self-service deletion does — including its
 * object-storage files, which a plain row delete would leave behind. It
 * deliberately doesn't guess which team content was theirs; an admin removes
 * specific submissions case by case with `submission:delete:all`.
 *
 * Audit-logged by user id only: the log must not keep the name or email the
 * request asked us to erase.
 * Requires user:purge:all permission.
 */
export async function purgeUser(userId: string): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    if (caller.id === userId) {
      return fail('Delete your own account from Account & Privacy instead.');
    }
    if (!(await Rbac.hasPermission(caller.id, 'user:purge:all'))) {
      return fail('Not authorized to purge users.');
    }

    const [target] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    if (!target) return fail('User not found');

    // Same guard as deleteUser: `user:purge:all` is meant to be grantable on
    // its own (e.g. a compliance role), which must not reach administrators.
    const targetIsAdmin = await Rbac.hasPermission(userId, 'user:all:all');
    const callerIsAdmin = await Rbac.hasPermission(caller.id, 'user:all:all');
    if (targetIsAdmin && !callerIsAdmin) {
      return fail('You cannot purge an administrator');
    }

    await prepareUserDeletion(userId);
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    await writeAuditLog({
      actorId: caller.id,
      action: 'user.purged',
      targetType: 'user',
      targetId: userId,
    });
    revalidatePath('/dashboard/admin/users');
    updateTag(ADMIN_COUNTS_CACHE_TAG);
    return ok();
  } catch (e) {
    return serverActionError('purge user', e);
  }
}

/**
 * Admin: set a user's password directly via the Better Auth admin plugin.
 * Requires the caller to have user:write:all and to be an admin in Better Auth
 * (user.role = 'admin').
 */
export async function adminSetUserPassword(userId: string, newPassword: string): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await Rbac.requirePermission(caller.id, 'user:write:all');

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
export async function adminSendPasswordReset(email: string): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await Rbac.requirePermission(caller.id, 'user:write:all');

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
 * so Better Auth emails them a link. Signing in applies the roles and deletes
 * the invite (`applyPendingInvite`, run from the session-create hook).
 */
export async function inviteUser(email: string, roleIds: number[]): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await Rbac.requirePermission(caller.id, 'user:write:all');

    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      return fail('Enter a valid email');
    }

    // Invites are for people with no account yet. An existing account gets
    // its roles edited directly, so an invite never replaces roles someone
    // already holds.
    const [existing] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(sql`lower(${schema.user.email}) = ${normalized}`)
      .limit(1);
    if (existing) {
      return fail('An account with this email already exists. Edit its roles instead.');
    }

    const denied = await Rbac.grantDeniedReason(caller.id, { roleIds });
    if (denied) return fail(denied);

    await db
      .insert(schema.invite)
      .values({
        email: normalized,
        roleIds,
        invitedBy: caller.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoUpdate({
        target: schema.invite.email,
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
        callbackURL: '/welcome',
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
 * Admin: revoke a pending invite before it's used. The magic link already
 * sent still signs them in, but without the invite they get no roles.
 */
export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await Rbac.requirePermission(caller.id, 'user:write:all');

    const [deleted] = await db
      .delete(schema.invite)
      .where(eq(schema.invite.id, inviteId))
      .returning({ email: schema.invite.email });
    if (!deleted) return fail('Invite not found');

    await writeAuditLog({
      actorId: caller.id,
      action: 'user.invite_revoked',
      targetType: 'invite',
      targetId: deleted.email,
    });
    revalidatePath('/dashboard/admin/users');
    return ok();
  } catch (e) {
    return serverActionError('revoke invite', e);
  }
}

/**
 * Checks whether the currently signed-in user has a password set on any
 * credential account. Used on /welcome to decide whether to prompt for a
 * password after a magic-link sign-in.
 */
export async function currentUserHasPassword(): Promise<ActionResult<{ hasPassword: boolean }>> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    const rows = await db
      .select({ password: schema.account.password })
      .from(schema.account)
      .where(eq(schema.account.userId, caller.id));
    const hasPassword = rows.some((r) => typeof r.password === 'string' && r.password.length > 0);
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
    await db.update(schema.user).set({ name: trimmed }).where(eq(schema.user.id, caller.id));
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
export async function setInitialPassword(newPassword: string): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    if (newPassword.length < 12) {
      return fail('Password must be at least 12 characters');
    }

    const existing = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(and(eq(schema.account.userId, caller.id), eq(schema.account.providerId, 'credential')))
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
 * Admin: ban a user. `banExpiresIn` is in seconds (omit for a permanent ban).
 */
export async function adminBanUser(userId: string, banReason?: string, banExpiresIn?: number): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    if (caller.id === userId) return fail('You cannot ban your own account');
    await Rbac.requirePermission(caller.id, 'user:write:all');

    const targetIsAdmin = await Rbac.hasPermission(userId, 'user:all:all');
    const callerIsAdmin = await Rbac.hasPermission(caller.id, 'user:all:all');
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
    await Rbac.requirePermission(caller.id, 'user:write:all');

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
export async function adminRevokeUserSessions(userId: string): Promise<ActionResult> {
  try {
    const caller = await getUser();
    if (!caller) return fail('Not authenticated');
    await Rbac.requirePermission(caller.id, 'user:write:all');

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
    await Rbac.requirePermission(caller.id, 'user:write:all');

    const changes: Record<string, unknown> = {};
    if (typeof patch.name === 'string' && patch.name.trim().length > 0) {
      changes.name = patch.name.trim();
    }
    if (typeof patch.emailVerified === 'boolean') {
      changes.emailVerified = patch.emailVerified;
    }
    if (Object.keys(changes).length === 0) return ok();

    await db.update(schema.user).set(changes).where(eq(schema.user.id, userId));
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
