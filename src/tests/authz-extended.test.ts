/**
 * Tests for authz functions not covered by authz.test.ts:
 *   getRolePermissions, hasAnyPermission, requireAnyPermission
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { getRolePermissions } from '@/app/actions/authz';
import * as Rbac from '@/lib/rbac/server';
import { getUser } from '@/utils/auth';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock('next/cache', () => ({ updateTag: vi.fn() }));

let userId: string;
// Separate from `userId`: holds the role:read:all that getRolePermissions needs.
let actorId: string;
let roleId: number;
let altRoleId: number;
let permIdA: number;
let permIdB: number;

beforeAll(async () => {
  const [u] = await db
    .insert(schema.user)
    .values({
      name: 'Authz Extended User',
      email: 'authz-ext@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  userId = u.id;
  const [actor] = await db
    .insert(schema.user)
    .values({
      name: 'Authz Extended Actor',
      email: 'authz-ext-actor@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  actorId = actor.id;
  const [superPerm] = await db
    .insert(schema.permission)
    .values({ slug: 'all:all:all' })
    .onConflictDoNothing()
    .returning({ id: schema.permission.id });
  const superPermId =
    superPerm?.id ??
    (
      await db
        .select({ id: schema.permission.id })
        .from(schema.permission)
        .where(eq(schema.permission.slug, 'all:all:all'))
        .limit(1)
    )[0]!.id;
  await db.insert(schema.userPermission).values({ userId: actorId, permissionId: superPermId }).onConflictDoNothing();
  vi.mocked(getUser).mockResolvedValue({ id: actorId } as never);

  const [roleA, roleB] = await db
    .insert(schema.role)
    .values([{ slug: 'ext-test-role-a' }, { slug: 'ext-test-role-b' }])
    .returning({ id: schema.role.id });
  roleId = roleA.id;
  altRoleId = roleB.id;

  const [permA, permB] = await db
    .insert(schema.permission)
    .values([{ slug: 'ext:read:all' }, { slug: 'ext:write:all' }])
    .returning({ id: schema.permission.id });
  permIdA = permA.id;
  permIdB = permB.id;

  // Assign role A to user, grant permA to role A
  await db.insert(schema.userRole).values({ userId, roleId });
  await db.insert(schema.rolePermissions).values({ roleId, permissionId: permIdA });

  // Grant permB directly to user
  await db.insert(schema.userPermission).values({ userId, permissionId: permIdB });
});

afterAll(async () => {
  await db.delete(schema.userRole).where(eq(schema.userRole.userId, userId));
  await db.delete(schema.userPermission).where(eq(schema.userPermission.userId, userId));
  await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId));
  await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, altRoleId));
  await db.delete(schema.role).where(eq(schema.role.id, roleId));
  await db.delete(schema.role).where(eq(schema.role.id, altRoleId));
  await db.delete(schema.permission).where(eq(schema.permission.id, permIdA));
  await db.delete(schema.permission).where(eq(schema.permission.id, permIdB));
  await db.delete(schema.user).where(eq(schema.user.id, userId));
  await db.delete(schema.user).where(eq(schema.user.id, actorId));
  await db.delete(schema.permission).where(eq(schema.permission.slug, 'all:all:all'));
});

describe('getRolePermissions', () => {
  test('returns permissions assigned to the role', async () => {
    const result = await getRolePermissions(roleId);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    const slugs = result.data!.map((p) => p.slug);
    expect(slugs).toContain('ext:read:all');
  });

  test('returns empty array for a role with no permissions', async () => {
    const result = await getRolePermissions(altRoleId);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data).toHaveLength(0);
  });
});

describe('hasAnyPermission', () => {
  test('returns true for empty permission list (vacuously true)', async () => {
    expect(await Rbac.hasAnyPermission(userId, [])).toBe(true);
  });

  test('returns true when user has one of the required permissions', async () => {
    // user has ext:read:all via role and ext:write:all directly
    expect(await Rbac.hasAnyPermission(userId, ['ext:read:all', 'ext:delete:all'])).toBe(true);
  });

  test('returns false when user has none of the required permissions', async () => {
    expect(await Rbac.hasAnyPermission(userId, ['nonexistent:perm:all', 'also:missing:all'])).toBe(false);
  });
});

describe('requireAnyPermission', () => {
  test('does not redirect when user has at least one of the permissions', async () => {
    let threw = false;
    try {
      await Rbac.requireAnyPermission(userId, ['ext:read:all', 'nonexistent:perm:all']);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  test('redirects to /forbidden when user has none of the permissions', async () => {
    let redirectTarget: string | null = null;
    try {
      await Rbac.requireAnyPermission(userId, ['missing:a:all', 'missing:b:all']);
    } catch (e) {
      redirectTarget = (e as Error).message;
    }
    expect(redirectTarget).toContain('/forbidden');
    expect(redirectTarget).toContain('missing_permission');
  });
});
