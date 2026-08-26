import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { db } from '@/utils/db';
import { eq, and } from 'drizzle-orm';
import {
  user,
  account,
  invite,
  permission,
  role,
  userPermission,
  userRole,
} from '@/db/schema';

vi.mock('@/utils/auth', () => ({
  getUser: vi.fn(),
  auth: {
    api: {
      setUserPassword: vi.fn().mockResolvedValue({ status: true }),
      requestPasswordReset: vi.fn().mockResolvedValue(undefined),
      signInMagicLink: vi.fn().mockResolvedValue(undefined),
      banUser: vi.fn().mockResolvedValue(undefined),
      unbanUser: vi.fn().mockResolvedValue(undefined),
      revokeUserSessions: vi.fn().mockResolvedValue(undefined),
    },
    $context: Promise.resolve({
      password: { hash: async (p: string) => `hashed:${p}` },
      internalAdapter: { createAccount: vi.fn().mockResolvedValue(undefined) },
    }),
  },
}));
vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue({}) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }
  }),
}));

import { getUser, auth } from '@/utils/auth';

import {
  listUsers,
  getUserDetails,
  updateUserRoles,
  updateUserDirectPermissions,
  deleteUser,
  adminSetUserPassword,
  adminSendPasswordReset,
  inviteUser,
  currentUserHasPassword,
  setOwnName,
  setInitialPassword,
  consumeInvite,
  adminBanUser,
  adminUnbanUser,
  adminRevokeUserSessions,
  updateUserProfile,
} from '@/app/actions/users';

let adminUserId: string;
let noPermUserId: string;
let targetUserId: string;
let superAdminUserId: string;

// adminUser intentionally does NOT get user:all:all so the "superadmin protection"
// checks in deleteUser/adminBanUser can be tested: admin can act but cannot delete/ban
// a user who has user:all:all unless the caller also has it.
const ALL_PERMS = ['user:read:all', 'user:write:all', 'user:all:all'];
const ADMIN_ONLY_PERMS = ['user:read:all', 'user:write:all'];
const permIds: Record<string, number> = {};
let adminRoleId: number;

type MockUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};
let adminUser: MockUser;
let noPermUser: MockUser;
let superAdminUser: MockUser;
let targetUser: MockUser;

beforeAll(async () => {
  const [admin] = await db
    .insert(user)
    .values({
      name: 'Admin User',
      email: 'users-admin@test.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  const [noPerm] = await db
    .insert(user)
    .values({
      name: 'No Perm',
      email: 'users-noperm@test.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  const [target] = await db
    .insert(user)
    .values({
      name: 'Target User',
      email: 'users-target@test.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  const [superAdmin] = await db
    .insert(user)
    .values({
      name: 'Super Admin',
      email: 'users-super@test.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  adminUserId = admin.id;
  noPermUserId = noPerm.id;
  targetUserId = target.id;
  superAdminUserId = superAdmin.id;

  adminUser = {
    id: adminUserId,
    email: 'users-admin@test.com',
    name: 'Admin User',
    emailVerified: true,
  };
  noPermUser = {
    id: noPermUserId,
    email: 'users-noperm@test.com',
    name: 'No Perm',
    emailVerified: true,
  };
  targetUser = {
    id: targetUserId,
    email: 'users-target@test.com',
    name: 'Target User',
    emailVerified: true,
  };
  superAdminUser = {
    id: superAdminUserId,
    email: 'users-super@test.com',
    name: 'Super Admin',
    emailVerified: true,
  };

  for (const slug of ALL_PERMS) {
    const [p] = await db
      .insert(permission)
      .values({ slug })
      .onConflictDoNothing()
      .returning({ id: permission.id });
    if (p) {
      permIds[slug] = p.id;
    } else {
      const [existing] = await db
        .select({ id: permission.id })
        .from(permission)
        .where(eq(permission.slug, slug))
        .limit(1);
      permIds[slug] = existing.id;
    }
  }

  for (const slug of ADMIN_ONLY_PERMS) {
    await db
      .insert(userPermission)
      .values({ userId: adminUserId, permissionId: permIds[slug]! })
      .onConflictDoNothing();
  }
  for (const slug of ALL_PERMS) {
    await db
      .insert(userPermission)
      .values({ userId: superAdminUserId, permissionId: permIds[slug]! })
      .onConflictDoNothing();
  }

  const [r] = await db
    .insert(role)
    .values({ slug: 'users-test-role' })
    .onConflictDoNothing()
    .returning({ id: role.id });
  adminRoleId =
    r?.id ??
    (
      await db
        .select({ id: role.id })
        .from(role)
        .where(eq(role.slug, 'users-test-role'))
        .limit(1)
    )[0].id;
});

beforeEach(() => {
  vi.mocked(getUser).mockResolvedValue(adminUser as never);
});

afterAll(async () => {
  await db.delete(userPermission).where(eq(userPermission.userId, adminUserId));
  await db
    .delete(userPermission)
    .where(eq(userPermission.userId, superAdminUserId));
  await db.delete(userRole).where(eq(userRole.userId, targetUserId));
  await db.delete(invite).where(eq(invite.email, 'invited@example.com'));
  await db.delete(role).where(eq(role.id, adminRoleId));
  await db.delete(user).where(eq(user.id, adminUserId));
  await db.delete(user).where(eq(user.id, noPermUserId));
  await db.delete(user).where(eq(user.id, targetUserId));
  await db.delete(user).where(eq(user.id, superAdminUserId));
});

// ─── listUsers ───────────────────────────────────────────────────────────────

describe('listUsers', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await listUsers();
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('authenticated');
  });

  test('fails when caller has no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(listUsers()).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:read:all',
    );
  });

  test('returns users list with pagination metadata', async () => {
    const result = await listUsers({ pageSize: 10 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.users).toBeInstanceOf(Array);
    expect(result.data?.page).toBe(1);
    expect(result.data?.totalPages).toBeGreaterThanOrEqual(1);
  });

  test('search by name returns matching users', async () => {
    const result = await listUsers({ search: 'Target User' });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    const found = result.data!.users.find((u) => u.id === targetUserId);
    expect(found).toBeDefined();
  });

  test('search by partial email returns matching users', async () => {
    const result = await listUsers({ search: 'users-target@' });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    const found = result.data!.users.find((u) => u.id === targetUserId);
    expect(found).toBeDefined();
  });

  test('filters users by a single role slug', async () => {
    await db
      .insert(userRole)
      .values({ userId: targetUserId, roleId: adminRoleId })
      .onConflictDoNothing();

    const result = await listUsers({ roleSlugs: ['users-test-role'] });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data?.users.map((entry) => entry.id)).toContain(targetUserId);

    await db
      .delete(userRole)
      .where(
        and(
          eq(userRole.userId, targetUserId),
          eq(userRole.roleId, adminRoleId),
        ),
      );
  });

  test('totalPages is at least 1 even when total is 0', async () => {
    const result = await listUsers({ search: 'no-match-xyz-9876543' });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data!.totalPages).toBe(1);
  });

  test('page clamped to minimum of 1', async () => {
    const result = await listUsers({ page: -5 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data!.page).toBe(1);
  });

  test('pageSize clamped to maximum of 200', async () => {
    const result = await listUsers({ pageSize: 999 });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data!.pageSize).toBe(200);
  });
});

// ─── getUserDetails ───────────────────────────────────────────────────────────

describe('getUserDetails', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await getUserDetails(targetUserId);
    expect(result.success).toBe(false);
  });

  test('fails when caller has no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(getUserDetails(targetUserId)).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:read:all',
    );
  });

  test('fails when user not found', async () => {
    const result = await getUserDetails('00000000-0000-0000-0000-000000000000');
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('not found');
  });

  test('returns user with roles and direct permissions', async () => {
    const result = await getUserDetails(targetUserId);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.id).toBe(targetUserId);
    expect(result.data?.email).toBe('users-target@test.com');
    expect(result.data?.roles).toBeInstanceOf(Array);
    expect(result.data?.directPermissions).toBeInstanceOf(Array);
  });
});

// ─── updateUserProfile ────────────────────────────────────────────────────────

describe('updateUserProfile', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await updateUserProfile(targetUserId, { name: 'New Name' });
    expect(result.success).toBe(false);
  });

  test('fails when no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(
      updateUserProfile(targetUserId, { name: 'X' }),
    ).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:write:all',
    );
  });

  test('empty patch is a no-op', async () => {
    const result = await updateUserProfile(targetUserId, {});
    expect(result.success).toBe(true);
  });

  test('updates user name', async () => {
    const result = await updateUserProfile(targetUserId, {
      name: 'Updated Name',
    });
    expect(result.success).toBe(true);
    const [row] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, targetUserId));
    expect(row.name).toBe('Updated Name');
    await db
      .update(user)
      .set({ name: 'Target User' })
      .where(eq(user.id, targetUserId));
  });

  test('updates emailVerified flag', async () => {
    const result = await updateUserProfile(targetUserId, {
      emailVerified: false,
    });
    expect(result.success).toBe(true);
    const [row] = await db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, targetUserId));
    expect(row.emailVerified).toBe(false);
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, targetUserId));
  });

  test('whitespace-only name is not applied', async () => {
    const [before] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, targetUserId));
    await updateUserProfile(targetUserId, { name: '   ' });
    const [after] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, targetUserId));
    expect(after.name).toBe(before.name);
  });
});

// ─── updateUserRoles / updateUserDirectPermissions ────────────────────────────

describe('updateUserRoles', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await updateUserRoles(targetUserId, []);
    expect(result.success).toBe(false);
  });

  test('fails when no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(updateUserRoles(targetUserId, [])).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:write:all',
    );
  });

  test('sets roles for user', async () => {
    const result = await updateUserRoles(targetUserId, [adminRoleId]);
    expect(result.success).toBe(true);
    const rows = await db
      .select()
      .from(userRole)
      .where(eq(userRole.userId, targetUserId));
    expect(rows.some((r) => r.roleId === adminRoleId)).toBe(true);
    await updateUserRoles(targetUserId, []);
  });
});

describe('updateUserDirectPermissions', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await updateUserDirectPermissions(targetUserId, []);
    expect(result.success).toBe(false);
  });

  test('fails when no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(updateUserDirectPermissions(targetUserId, [])).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:write:all',
    );
  });

  test('sets direct permissions for user', async () => {
    const result = await updateUserDirectPermissions(targetUserId, [
      permIds['user:read:all']!,
    ]);
    expect(result.success).toBe(true);
    const rows = await db
      .select()
      .from(userPermission)
      .where(eq(userPermission.userId, targetUserId));
    expect(rows.some((r) => r.permissionId === permIds['user:read:all'])).toBe(
      true,
    );
    await updateUserDirectPermissions(targetUserId, []);
  });
});

// ─── deleteUser ──────────────────────────────────────────────────────────────

describe('deleteUser', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await deleteUser(targetUserId);
    expect(result.success).toBe(false);
  });

  test('fails when trying to delete own account', async () => {
    const result = await deleteUser(adminUserId);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('own account');
  });

  test('fails when no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(deleteUser(targetUserId)).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:write:all',
    );
  });

  test('fails when target is superadmin and caller is not', async () => {
    const result = await deleteUser(superAdminUserId);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('administrator');
  });

  test('superadmin can delete another superadmin', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(superAdminUser as never);
    const [victim] = await db
      .insert(user)
      .values({
        name: 'Victim Admin',
        email: 'victim-admin@test.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    await db
      .insert(userPermission)
      .values({ userId: victim.id, permissionId: permIds['user:all:all']! })
      .onConflictDoNothing();
    await db
      .insert(userPermission)
      .values({ userId: victim.id, permissionId: permIds['user:write:all']! })
      .onConflictDoNothing();

    const result = await deleteUser(victim.id);
    expect(result.success).toBe(true);
    const rows = await db.select().from(user).where(eq(user.id, victim.id));
    expect(rows).toHaveLength(0);
  });

  test('deletes a regular user', async () => {
    const [deletable] = await db
      .insert(user)
      .values({
        name: 'Deletable',
        email: 'deletable@test.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    const result = await deleteUser(deletable.id);
    expect(result.success).toBe(true);
    const rows = await db.select().from(user).where(eq(user.id, deletable.id));
    expect(rows).toHaveLength(0);
  });
});

// ─── currentUserHasPassword ───────────────────────────────────────────────────

describe('currentUserHasPassword', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await currentUserHasPassword();
    expect(result.success).toBe(false);
  });

  test('returns hasPassword: false when no accounts exist', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(targetUser as never);
    const result = await currentUserHasPassword();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.hasPassword).toBe(false);
  });

  test('returns hasPassword: true when credential account with password exists', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(targetUser as never);
    await db.insert(account).values({
      userId: targetUserId,
      accountId: targetUserId,
      providerId: 'credential',
      password: 'hashed_pw',
    });
    const result = await currentUserHasPassword();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.hasPassword).toBe(true);
    await db
      .delete(account)
      .where(
        and(
          eq(account.userId, targetUserId),
          eq(account.providerId, 'credential'),
        ),
      );
  });

  test('returns hasPassword: false when credential account has null password', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(targetUser as never);
    await db.insert(account).values({
      userId: targetUserId,
      accountId: targetUserId,
      providerId: 'credential',
      password: null,
    });
    const result = await currentUserHasPassword();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.hasPassword).toBe(false);
    await db
      .delete(account)
      .where(
        and(
          eq(account.userId, targetUserId),
          eq(account.providerId, 'credential'),
        ),
      );
  });
});

// ─── setOwnName ───────────────────────────────────────────────────────────────

describe('setOwnName', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await setOwnName('Alice');
    expect(result.success).toBe(false);
  });

  test('fails when name is empty after trimming', async () => {
    const result = await setOwnName('   ');
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('name');
  });

  test('fails when name exceeds 200 characters', async () => {
    const result = await setOwnName('A'.repeat(201));
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('long');
  });

  test('updates the user display name', async () => {
    const result = await setOwnName('Alice Renamed');
    expect(result.success).toBe(true);
    const [row] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, adminUserId));
    expect(row.name).toBe('Alice Renamed');
    await db
      .update(user)
      .set({ name: 'Admin User' })
      .where(eq(user.id, adminUserId));
  });

  test('trims leading and trailing whitespace from name', async () => {
    const result = await setOwnName('  Trimmed  ');
    expect(result.success).toBe(true);
    const [row] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, adminUserId));
    expect(row.name).toBe('Trimmed');
    await db
      .update(user)
      .set({ name: 'Admin User' })
      .where(eq(user.id, adminUserId));
  });
});

// ─── setInitialPassword ───────────────────────────────────────────────────────

describe('setInitialPassword', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await setInitialPassword('password123');
    expect(result.success).toBe(false);
  });

  test('fails when password is shorter than 12 characters', async () => {
    const result = await setInitialPassword('short');
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('12');
  });

  test('fails when user already has a credential account', async () => {
    await db.insert(account).values({
      userId: adminUserId,
      accountId: adminUserId,
      providerId: 'credential',
      password: 'existing_hash',
    });
    const result = await setInitialPassword('newpassword123');
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('already');
    await db
      .delete(account)
      .where(
        and(
          eq(account.userId, adminUserId),
          eq(account.providerId, 'credential'),
        ),
      );
  });

  test('succeeds when no credential account exists', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(targetUser as never);
    const result = await setInitialPassword('newpassword123');
    expect(result.success).toBe(true);
    await db
      .delete(account)
      .where(
        and(
          eq(account.userId, targetUserId),
          eq(account.providerId, 'credential'),
        ),
      );
  });
});

// ─── consumeInvite ────────────────────────────────────────────────────────────

describe('consumeInvite', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await consumeInvite();
    expect(result.success).toBe(false);
  });

  test('returns { consumed: false } when no invite exists', async () => {
    const result = await consumeInvite();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.consumed).toBe(false);
  });

  test('consumes invite and applies role assignments', async () => {
    await db.insert(invite).values({
      email: 'users-admin@test.com',
      roleIds: [adminRoleId],
      invitedBy: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await consumeInvite();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.consumed).toBe(true);

    const remaining = await db
      .select()
      .from(invite)
      .where(eq(invite.email, 'users-admin@test.com'));
    expect(remaining).toHaveLength(0);

    await db.delete(userRole).where(eq(userRole.userId, adminUserId));
  });

  test('consumes invite with empty roleIds (no setUserRoles)', async () => {
    await db.insert(invite).values({
      email: 'users-admin@test.com',
      roleIds: [],
      invitedBy: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const result = await consumeInvite();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error((result as { error: string }).error);
    expect(result.data?.consumed).toBe(true);

    const remaining = await db
      .select()
      .from(invite)
      .where(eq(invite.email, 'users-admin@test.com'));
    expect(remaining).toHaveLength(0);
  });
});

// ─── inviteUser ───────────────────────────────────────────────────────────────

describe('inviteUser', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await inviteUser('invited@example.com', []);
    expect(result.success).toBe(false);
  });

  test('fails when no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(inviteUser('invited@example.com', [])).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:write:all',
    );
  });

  test('fails for email without @ symbol', async () => {
    const result = await inviteUser('notanemail', []);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('email');
  });

  test('creates invite row and triggers magic link', async () => {
    const result = await inviteUser('invited@example.com', [adminRoleId]);
    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(invite)
      .where(eq(invite.email, 'invited@example.com'));
    expect(rows).toHaveLength(1);
    expect(rows[0].roleIds).toContain(adminRoleId);
    expect(vi.mocked(auth.api.signInMagicLink)).toHaveBeenCalled();

    await db.delete(invite).where(eq(invite.email, 'invited@example.com'));
  });

  test('re-inviting same email updates the invite row', async () => {
    await inviteUser('invited@example.com', []);
    const result = await inviteUser('invited@example.com', [adminRoleId]);
    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(invite)
      .where(eq(invite.email, 'invited@example.com'));
    expect(rows).toHaveLength(1);
    expect(rows[0].roleIds).toContain(adminRoleId);

    await db.delete(invite).where(eq(invite.email, 'invited@example.com'));
  });
});

// ─── adminBanUser ─────────────────────────────────────────────────────────────

describe('adminBanUser', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await adminBanUser(targetUserId);
    expect(result.success).toBe(false);
  });

  test('fails when trying to ban own account', async () => {
    const result = await adminBanUser(adminUserId);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('own account');
  });

  test('fails when no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(adminBanUser(targetUserId)).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:write:all',
    );
  });

  test('fails when target is superadmin and caller is not', async () => {
    const result = await adminBanUser(superAdminUserId);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain('administrator');
  });

  test('bans a regular user via auth.api.banUser', async () => {
    const result = await adminBanUser(targetUserId, 'Violation of TOS');
    expect(result.success).toBe(true);
    expect(vi.mocked(auth.api.banUser)).toHaveBeenCalled();
  });
});

// ─── adminUnbanUser ───────────────────────────────────────────────────────────

describe('adminUnbanUser', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await adminUnbanUser(targetUserId);
    expect(result.success).toBe(false);
  });

  test('fails when no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(adminUnbanUser(targetUserId)).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:write:all',
    );
  });

  test('calls auth.api.unbanUser', async () => {
    const result = await adminUnbanUser(targetUserId);
    expect(result.success).toBe(true);
    expect(vi.mocked(auth.api.unbanUser)).toHaveBeenCalled();
  });
});

// ─── adminRevokeUserSessions ──────────────────────────────────────────────────

describe('adminRevokeUserSessions', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await adminRevokeUserSessions(targetUserId);
    expect(result.success).toBe(false);
  });

  test('fails when no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(adminRevokeUserSessions(targetUserId)).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:write:all',
    );
  });

  test('calls auth.api.revokeUserSessions', async () => {
    const result = await adminRevokeUserSessions(targetUserId);
    expect(result.success).toBe(true);
    expect(vi.mocked(auth.api.revokeUserSessions)).toHaveBeenCalled();
  });
});

// ─── adminSetUserPassword ─────────────────────────────────────────────────────

describe('adminSetUserPassword', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await adminSetUserPassword(targetUserId, 'newpass');
    expect(result.success).toBe(false);
  });

  test('fails when no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(
      adminSetUserPassword(targetUserId, 'newpass123'),
    ).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:write:all',
    );
  });

  test('returns error when auth.api.setUserPassword indicates failure', async () => {
    vi.mocked(auth.api.setUserPassword).mockResolvedValueOnce({
      status: false,
    } as never);
    const result = await adminSetUserPassword(targetUserId, 'newpass123');
    expect(result.success).toBe(false);
  });

  test('succeeds when auth.api.setUserPassword returns truthy status', async () => {
    vi.mocked(auth.api.setUserPassword).mockResolvedValueOnce({
      status: true,
    } as never);
    const result = await adminSetUserPassword(targetUserId, 'newpass123');
    expect(result.success).toBe(true);
  });
});

// ─── adminSendPasswordReset ───────────────────────────────────────────────────

describe('adminSendPasswordReset', () => {
  test('fails when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    const result = await adminSendPasswordReset('users-target@test.com');
    expect(result.success).toBe(false);
  });

  test('fails when no permission', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(
      adminSendPasswordReset('users-target@test.com'),
    ).rejects.toThrow(
      'REDIRECT:/forbidden?reason=missing_permission&permission=user:write:all',
    );
  });

  test('calls requestPasswordReset and returns success', async () => {
    const result = await adminSendPasswordReset('users-target@test.com');
    expect(result.success).toBe(true);
    expect(vi.mocked(auth.api.requestPasswordReset)).toHaveBeenCalled();
  });
});
