/**
 * Tests for src/app/actions/authz.ts
 *
 * Covers three distinct access models:
 *  - mayInspectUser: allowed if caller === target OR caller has user:read:all
 *  - mayReadAdministration: requires a specific permission (no self-exemption)
 *
 * All guards return false → fail('Forbidden') rather than redirecting, so every
 * denied case resolves to { success: false }, never a thrown redirect.
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import { user, permission, userPermission, role, rolePermissions, userRole } from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));

import { getUser } from '@/utils/auth';
import {
  getUserPermissions,
  getUserRoles,
  getDirectUserPermissions,
  getRolePermissions,
  getRolesForUsers,
} from '@/app/actions/authz';

type MockUser = { id: string; email: string; name: string; emailVerified: boolean };

let userAId: string;   // has no permissions
let userBId: string;   // has user:read:all
let userA: MockUser;
let userB: MockUser;
let testRoleId: number;

beforeAll(async () => {
  const [a] = await db
    .insert(user)
    .values({ name: 'Authz User A', email: 'authz-a@example.com', emailVerified: true })
    .returning({ id: user.id });
  const [b] = await db
    .insert(user)
    .values({ name: 'Authz User B', email: 'authz-b@example.com', emailVerified: true })
    .returning({ id: user.id });

  userAId = a.id;
  userBId = b.id;
  userA = { id: userAId, email: 'authz-a@example.com', name: 'Authz User A', emailVerified: true };
  userB = { id: userBId, email: 'authz-b@example.com', name: 'Authz User B', emailVerified: true };

  // Grant userB user:read:all and role:read:all for cross-user inspection tests
  const ensurePerm = async (slug: string) => {
    const [created] = await db
      .insert(permission)
      .values({ slug })
      .onConflictDoNothing()
      .returning({ id: permission.id });
    if (created) return created.id;
    const [existing] = await db
      .select({ id: permission.id })
      .from(permission)
      .where(eq(permission.slug, slug))
      .limit(1);
    return existing!.id;
  };

  const userReadId = await ensurePerm('user:read:all');
  const roleReadId = await ensurePerm('role:read:all');

  await db
    .insert(userPermission)
    .values([
      { userId: userBId, permissionId: userReadId },
      { userId: userBId, permissionId: roleReadId },
    ])
    .onConflictDoNothing();

  const [r] = await db
    .insert(role)
    .values({ slug: 'authz-test-role', description: 'test' })
    .returning({ id: role.id });
  testRoleId = r.id;

  vi.mocked(getUser).mockResolvedValue(userA as never);
});

afterAll(async () => {
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, testRoleId));
  await db.delete(userRole).where(eq(userRole.userId, userBId));
  await db.delete(userPermission).where(eq(userPermission.userId, userBId));
  await db.delete(role).where(eq(role.id, testRoleId));
  await db.delete(user).where(eq(user.id, userAId));
  await db.delete(user).where(eq(user.id, userBId));
  await db.delete(permission).where(eq(permission.slug, 'user:read:all'));
  await db.delete(permission).where(eq(permission.slug, 'role:read:all'));
});

// ─── getUserPermissions ────────────────────────────────────────────────────────

describe('getUserPermissions', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getUserPermissions(userAId)).resolves.toMatchObject({ success: false });
  });

  test('allows a user to inspect their own permissions (no admin perm needed)', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userA as never);
    const result = await getUserPermissions(userAId);
    expect(result.success).toBe(true);
  });

  test('blocks inspection of another user without user:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userA as never);
    await expect(getUserPermissions(userBId)).resolves.toMatchObject({ success: false });
  });

  test('allows inspection of another user with user:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userB as never);
    const result = await getUserPermissions(userAId);
    expect(result.success).toBe(true);
  });
});

// ─── getUserRoles ──────────────────────────────────────────────────────────────

describe('getUserRoles', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getUserRoles(userAId)).resolves.toMatchObject({ success: false });
  });

  test('allows a user to inspect their own roles', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userA as never);
    const result = await getUserRoles(userAId);
    expect(result.success).toBe(true);
  });

  test('blocks inspection of another user without user:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userA as never);
    await expect(getUserRoles(userBId)).resolves.toMatchObject({ success: false });
  });

  test('allows inspection of another user with user:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userB as never);
    const result = await getUserRoles(userAId);
    expect(result.success).toBe(true);
  });
});

// ─── getDirectUserPermissions ─────────────────────────────────────────────────

describe('getDirectUserPermissions', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getDirectUserPermissions(userAId)).resolves.toMatchObject({ success: false });
  });

  test('allows a user to inspect their own direct permissions', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userA as never);
    const result = await getDirectUserPermissions(userAId);
    expect(result.success).toBe(true);
  });

  test('blocks inspection of another user without user:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userA as never);
    await expect(getDirectUserPermissions(userBId)).resolves.toMatchObject({ success: false });
  });
});

// ─── getRolePermissions — requires role:read:all, no self-exemption ───────────

describe('getRolePermissions', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getRolePermissions(testRoleId)).resolves.toMatchObject({ success: false });
  });

  test('fails for authenticated user without role:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userA as never);
    await expect(getRolePermissions(testRoleId)).resolves.toMatchObject({ success: false });
  });

  test('succeeds for user with role:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userB as never);
    const result = await getRolePermissions(testRoleId);
    expect(result.success).toBe(true);
  });
});

// ─── getRolesForUsers — requires user:read:all, no self-exemption ─────────────

describe('getRolesForUsers', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getRolesForUsers([userAId])).resolves.toMatchObject({ success: false });
  });

  test('fails for authenticated user without user:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userA as never);
    await expect(getRolesForUsers([userBId])).resolves.toMatchObject({ success: false });
  });

  test('succeeds for user with user:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userB as never);
    const result = await getRolesForUsers([userAId]);
    expect(result.success).toBe(true);
  });
});
