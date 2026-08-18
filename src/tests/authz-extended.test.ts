/**
 * Tests for authz.ts functions not covered by authz.test.ts:
 *   getUserRoles, getDirectUserPermissions, getRolePermissions,
 *   getRolesForUsers, hasAnyPermission, hasAllPermissions,
 *   hasRole, requireAnyPermission
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import {
  user,
  role,
  permission,
  rolePermissions,
  userRole,
  userPermission,
} from '@/db/schema';
import {
  getUserRoles,
  getDirectUserPermissions,
  getRolePermissions,
  getRolesForUsers,
} from '@/app/actions/authz';
import {
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  requireAnyPermission,
} from '@/lib/rbac/authorization';
import {
  createRole,
  addPermission,
  assignRoleToUser,
  grantPermissionToRole,
  grantPermissionToUser,
} from '@/app/actions/roles';
import { getUser } from '@/utils/auth';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

let userId: string;
let roleId: number;
let altRoleId: number;
let permIdA: number;
let permIdB: number;

beforeAll(async () => {
  const [u] = await db
    .insert(user)
    .values({
      name: 'Authz Extended User',
      email: 'authz-ext@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  userId = u.id;
  const privilegeSlugs = ['role:all:all', 'permission:all:all', 'user:all:all'];
  for (const slug of privilegeSlugs) {
    const [created] = await db
      .insert(permission)
      .values({ slug })
      .onConflictDoNothing()
      .returning({ id: permission.id });
    const permissionId =
      created?.id ??
      (
        await db
          .select({ id: permission.id })
          .from(permission)
          .where(eq(permission.slug, slug))
          .limit(1)
      )[0]!.id;
    await db
      .insert(userPermission)
      .values({ userId, permissionId })
      .onConflictDoNothing();
  }
  vi.mocked(getUser).mockResolvedValue({ id: userId } as never);

  const r1 = await createRole('ext-test-role-a', 'Extended test role A');
  const r2 = await createRole('ext-test-role-b', 'Extended test role B');
  roleId = r1.data!;
  altRoleId = r2.data!;

  const pA = await addPermission('ext:read:all', 'Ext read all');
  const pB = await addPermission('ext:write:all', 'Ext write all');
  permIdA = pA.data!;
  permIdB = pB.data!;

  // Assign role A to user, grant permA to role A
  await assignRoleToUser(userId, roleId);
  await grantPermissionToRole(roleId, permIdA);

  // Grant permB directly to user
  await grantPermissionToUser(userId, permIdB);
});

afterAll(async () => {
  await db.delete(userRole).where(eq(userRole.userId, userId));
  await db.delete(userPermission).where(eq(userPermission.userId, userId));
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, altRoleId));
  await db.delete(role).where(eq(role.id, roleId));
  await db.delete(role).where(eq(role.id, altRoleId));
  await db.delete(permission).where(eq(permission.id, permIdA));
  await db.delete(permission).where(eq(permission.id, permIdB));
  await db.delete(user).where(eq(user.id, userId));
});

describe('getUserRoles', () => {
  test('returns roles assigned to the user', async () => {
    const result = await getUserRoles(userId);
    expect(result.success).toBe(true);
    const slugs = result.data!.map((r) => r.slug);
    expect(slugs).toContain('ext-test-role-a');
  });

  test('does not include roles the user was not assigned', async () => {
    const result = await getUserRoles(userId);
    expect(result.success).toBe(true);
    const slugs = result.data!.map((r) => r.slug);
    expect(slugs).not.toContain('ext-test-role-b');
  });

  test('returns empty array for user with no roles', async () => {
    const [u] = await db
      .insert(user)
      .values({
        name: 'No Role User',
        email: 'no-role@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    const result = await getUserRoles(u.id);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
    await db.delete(user).where(eq(user.id, u.id));
  });
});

describe('getDirectUserPermissions', () => {
  test('returns only directly assigned permissions, not role-inherited ones', async () => {
    const result = await getDirectUserPermissions(userId);
    expect(result.success).toBe(true);
    const slugs = result.data!.map((p) => p.slug);
    // permB is directly assigned
    expect(slugs).toContain('ext:write:all');
    // permA is role-inherited, NOT direct
    expect(slugs).not.toContain('ext:read:all');
  });

  test('returns empty array for user with no direct permissions', async () => {
    const [u] = await db
      .insert(user)
      .values({
        name: 'No Perm User',
        email: 'no-perm@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    const result = await getDirectUserPermissions(u.id);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
    await db.delete(user).where(eq(user.id, u.id));
  });
});

describe('getRolePermissions', () => {
  test('returns permissions assigned to the role', async () => {
    const result = await getRolePermissions(roleId);
    expect(result.success).toBe(true);
    const slugs = result.data!.map((p) => p.slug);
    expect(slugs).toContain('ext:read:all');
  });

  test('returns empty array for a role with no permissions', async () => {
    const result = await getRolePermissions(altRoleId);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
  });
});

describe('getRolesForUsers', () => {
  test('returns empty object for empty user list', async () => {
    const result = await getRolesForUsers([]);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  test('returns roles keyed by user ID', async () => {
    const result = await getRolesForUsers([userId]);
    expect(result.success).toBe(true);
    expect(result.data![userId]).toBeDefined();
    const slugs = result.data![userId].map((r) => r.slug);
    expect(slugs).toContain('ext-test-role-a');
  });

  test('includes all queried users even if they have no roles', async () => {
    const [u] = await db
      .insert(user)
      .values({
        name: 'Batch Test User',
        email: 'batch@example.com',
        emailVerified: true,
      })
      .returning({ id: user.id });

    const result = await getRolesForUsers([userId, u.id]);
    expect(result.success).toBe(true);
    expect(result.data![u.id]).toEqual([]);
    expect(result.data![userId].length).toBeGreaterThan(0);

    await db.delete(user).where(eq(user.id, u.id));
  });
});

describe('hasAnyPermission', () => {
  test('returns true for empty permission list (vacuously true)', async () => {
    expect(await hasAnyPermission(userId, [])).toBe(true);
  });

  test('returns true when user has one of the required permissions', async () => {
    // user has ext:read:all via role and ext:write:all directly
    expect(
      await hasAnyPermission(userId, ['ext:read:all', 'ext:delete:all']),
    ).toBe(true);
  });

  test('returns false when user has none of the required permissions', async () => {
    expect(
      await hasAnyPermission(userId, [
        'nonexistent:perm:all',
        'also:missing:all',
      ]),
    ).toBe(false);
  });
});

describe('hasAllPermissions', () => {
  test('returns true for empty permission list (vacuously true)', async () => {
    expect(await hasAllPermissions(userId, [])).toBe(true);
  });

  test('returns true when user has all of the required permissions', async () => {
    // user has both ext:read:all (via role) and ext:write:all (direct)
    expect(
      await hasAllPermissions(userId, ['ext:read:all', 'ext:write:all']),
    ).toBe(true);
  });

  test('returns false when user is missing one of the required permissions', async () => {
    expect(
      await hasAllPermissions(userId, ['ext:read:all', 'nonexistent:perm:all']),
    ).toBe(false);
  });

  test('returns false when user has none of the required permissions', async () => {
    expect(
      await hasAllPermissions(userId, ['missing:a:all', 'missing:b:all']),
    ).toBe(false);
  });
});

describe('hasRole', () => {
  test('returns true when user has the role', async () => {
    expect(await hasRole(userId, 'ext-test-role-a')).toBe(true);
  });

  test('returns false when user does not have the role', async () => {
    expect(await hasRole(userId, 'ext-test-role-b')).toBe(false);
  });

  test('returns false for a completely nonexistent role slug', async () => {
    expect(await hasRole(userId, 'nonexistent-role-xyz')).toBe(false);
  });
});

describe('requireAnyPermission', () => {
  test('does not redirect when user has at least one of the permissions', async () => {
    let threw = false;
    try {
      await requireAnyPermission(userId, [
        'ext:read:all',
        'nonexistent:perm:all',
      ]);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  test('redirects to /forbidden when user has none of the permissions', async () => {
    let redirectTarget: string | null = null;
    try {
      await requireAnyPermission(userId, ['missing:a:all', 'missing:b:all']);
    } catch (e) {
      redirectTarget = (e as Error).message;
    }
    expect(redirectTarget).toContain('/forbidden');
    expect(redirectTarget).toContain('missing_permission');
  });
});

