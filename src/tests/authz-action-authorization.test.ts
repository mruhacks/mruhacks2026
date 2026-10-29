/**
 * Tests for src/app/actions/authz.ts
 *
 * mayReadAdministration requires a specific permission (no self-exemption).
 *
 * The guard returns false → fail('Forbidden') rather than redirecting, so every
 * denied case resolves to { success: false }, never a thrown redirect.
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));

import { getUser } from '@/utils/auth';
import { getRolePermissions } from '@/app/actions/authz';

type MockUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

let userAId: string; // has no permissions
let userBId: string; // has role:read:all
let userA: MockUser;
let userB: MockUser;
let testRoleId: number;

beforeAll(async () => {
  const [a] = await db
    .insert(schema.user)
    .values({
      name: 'Authz User A',
      email: 'authz-a@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  const [b] = await db
    .insert(schema.user)
    .values({
      name: 'Authz User B',
      email: 'authz-b@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });

  userAId = a.id;
  userBId = b.id;
  userA = {
    id: userAId,
    email: 'authz-a@example.com',
    name: 'Authz User A',
    emailVerified: true,
  };
  userB = {
    id: userBId,
    email: 'authz-b@example.com',
    name: 'Authz User B',
    emailVerified: true,
  };

  // Grant userB role:read:all
  const ensurePerm = async (slug: string) => {
    const [created] = await db
      .insert(schema.permission)
      .values({ slug })
      .onConflictDoNothing()
      .returning({ id: schema.permission.id });
    if (created) return created.id;
    const [existing] = await db
      .select({ id: schema.permission.id })
      .from(schema.permission)
      .where(eq(schema.permission.slug, slug))
      .limit(1);
    return existing!.id;
  };

  const roleReadId = await ensurePerm('role:read:all');

  await db.insert(schema.userPermission).values({ userId: userBId, permissionId: roleReadId }).onConflictDoNothing();

  const [r] = await db
    .insert(schema.role)
    .values({ slug: 'authz-test-role', description: 'test' })
    .returning({ id: schema.role.id });
  testRoleId = r.id;

  vi.mocked(getUser).mockResolvedValue(userA as never);
});

afterAll(async () => {
  await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, testRoleId));
  await db.delete(schema.userRole).where(eq(schema.userRole.userId, userBId));
  await db.delete(schema.userPermission).where(eq(schema.userPermission.userId, userBId));
  await db.delete(schema.role).where(eq(schema.role.id, testRoleId));
  await db.delete(schema.user).where(eq(schema.user.id, userAId));
  await db.delete(schema.user).where(eq(schema.user.id, userBId));
  await db.delete(schema.permission).where(eq(schema.permission.slug, 'role:read:all'));
});

// ─── getRolePermissions — requires role:read:all, no self-exemption ───────────

describe('getRolePermissions', () => {
  test('fails when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(getRolePermissions(testRoleId)).resolves.toMatchObject({
      success: false,
    });
  });

  test('fails for authenticated user without role:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userA as never);
    await expect(getRolePermissions(testRoleId)).resolves.toMatchObject({
      success: false,
    });
  });

  test('succeeds for user with role:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(userB as never);
    const result = await getRolePermissions(testRoleId);
    expect(result.success).toBe(true);
  });
});
