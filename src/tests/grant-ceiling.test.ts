/**
 * Granting roles or permissions requires holding every permission being
 * granted, so a delegated RBAC/user-management permission can't be turned
 * into full access (for the caller or anyone else).
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';

vi.mock('server-only', () => ({}));
vi.mock('@/utils/auth', () => ({ getUser: vi.fn(), auth: {} }));
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import { getUser } from '@/utils/auth';
import {
  assignRoleToUser,
  grantPermissionToRole,
  grantPermissionToUser,
  setRolePermissions,
  setUserDirectPermissions,
  setUserRoles,
  updatePermission,
} from '@/app/actions/roles';
import { inviteUser, updateUserDirectPermissions, updateUserRoles } from '@/app/actions/users';

const DELEGATED = ['role:write:all', 'permission:write:all', 'user:write:all'];
const DENIED = /can't grant permissions you don't have/;

let managerId: string;
let targetId: string;
let heldPermId: number; // a permission the manager holds
let unheldPermId: number; // a permission the manager does not hold
let powerfulRoleId: number; // carries `unheldPermId`
let modestRoleId: number; // carries only `heldPermId`
const permIds: number[] = [];

async function ensurePerm(slug: string): Promise<number> {
  const [created] = await db
    .insert(schema.permission)
    .values({ slug })
    .onConflictDoNothing()
    .returning({ id: schema.permission.id });
  const id =
    created?.id ??
    (
      await db
        .select({ id: schema.permission.id })
        .from(schema.permission)
        .where(eq(schema.permission.slug, slug))
        .limit(1)
    )[0]!.id;
  permIds.push(id);
  return id;
}

beforeAll(async () => {
  const [manager] = await db
    .insert(schema.user)
    .values({
      name: 'Grant Ceiling Manager',
      email: 'grant-ceiling-manager@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  const [target] = await db
    .insert(schema.user)
    .values({
      name: 'Grant Ceiling Target',
      email: 'grant-ceiling-target@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  managerId = manager.id;
  targetId = target.id;

  for (const slug of DELEGATED) {
    await db.insert(schema.userPermission).values({ userId: managerId, permissionId: await ensurePerm(slug) });
  }
  heldPermId = await ensurePerm('grantceil:read:all');
  unheldPermId = await ensurePerm('grantceil:write:all');
  await db.insert(schema.userPermission).values({ userId: managerId, permissionId: heldPermId });

  const [powerful] = await db
    .insert(schema.role)
    .values({ slug: 'grant-ceiling-powerful' })
    .returning({ id: schema.role.id });
  const [modest] = await db
    .insert(schema.role)
    .values({ slug: 'grant-ceiling-modest' })
    .returning({ id: schema.role.id });
  powerfulRoleId = powerful.id;
  modestRoleId = modest.id;
  await db.insert(schema.rolePermissions).values([
    { roleId: powerfulRoleId, permissionId: unheldPermId },
    { roleId: modestRoleId, permissionId: heldPermId },
  ]);

  vi.mocked(getUser).mockResolvedValue({
    id: managerId,
    email: 'grant-ceiling-manager@example.com',
  } as never);
});

afterAll(async () => {
  const users = [managerId, targetId];
  await db.delete(schema.userRole).where(inArray(schema.userRole.userId, users));
  await db.delete(schema.userPermission).where(inArray(schema.userPermission.userId, users));
  await db.delete(schema.role).where(inArray(schema.role.id, [powerfulRoleId, modestRoleId]));
  await db.delete(schema.invite).where(eq(schema.invite.email, 'grant-ceiling@example.com'));
  await db.delete(schema.user).where(inArray(schema.user.id, users));
  await db
    .delete(schema.permission)
    .where(inArray(schema.permission.slug, ['grantceil:read:all', 'grantceil:write:all']));
});

describe('refuses grants of permissions the caller lacks', () => {
  test.each([
    ['assignRoleToUser (self)', () => assignRoleToUser(managerId, powerfulRoleId)],
    ['setUserRoles (self)', () => setUserRoles(managerId, [powerfulRoleId])],
    ['updateUserRoles (other)', () => updateUserRoles(targetId, [powerfulRoleId])],
    ['grantPermissionToUser (self)', () => grantPermissionToUser(managerId, unheldPermId)],
    ['setUserDirectPermissions (other)', () => setUserDirectPermissions(targetId, [unheldPermId])],
    ['updateUserDirectPermissions (self)', () => updateUserDirectPermissions(managerId, [unheldPermId])],
    ['grantPermissionToRole', () => grantPermissionToRole(modestRoleId, unheldPermId)],
    ['setRolePermissions', () => setRolePermissions(modestRoleId, [heldPermId, unheldPermId])],
    ['inviteUser', () => inviteUser('grant-ceiling@example.com', [powerfulRoleId])],
    ['updatePermission rename to a wildcard', () => updatePermission(heldPermId, { slug: 'all:all:all' })],
  ])('%s', async (_name, run) => {
    const result = await run();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(DENIED);
    expect(result.error).toContain(_name.startsWith('updatePermission') ? 'all:all:all' : 'grantceil:write:all');
  });

  test('nothing was written by the refused grants', async () => {
    const roles = await db
      .select()
      .from(schema.userRole)
      .where(inArray(schema.userRole.userId, [managerId, targetId]));
    expect(roles).toHaveLength(0);
    const modestPerms = await db
      .select()
      .from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, modestRoleId));
    expect(modestPerms.map((r) => r.permissionId)).toEqual([heldPermId]);
    const [perm] = await db
      .select({ slug: schema.permission.slug })
      .from(schema.permission)
      .where(eq(schema.permission.id, heldPermId));
    expect(perm!.slug).toBe('grantceil:read:all');
  });
});

describe('allows grants within what the caller holds', () => {
  test('assigning a role whose permissions the caller holds', async () => {
    expect((await updateUserRoles(targetId, [modestRoleId])).success).toBe(true);
  });

  test('keeping an already-assigned role the caller could not grant', async () => {
    // Seeded directly: the manager couldn't have assigned it.
    await db.insert(schema.userRole).values({ userId: targetId, roleId: powerfulRoleId });
    const result = await updateUserRoles(targetId, [modestRoleId, powerfulRoleId]);
    expect(result.success).toBe(true);
  });

  test('removing a role the caller could not grant', async () => {
    expect((await updateUserRoles(targetId, [modestRoleId])).success).toBe(true);
  });
});
