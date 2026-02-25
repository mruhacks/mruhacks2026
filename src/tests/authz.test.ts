/**
 * Authorization module test suite
 *
 * Tests both CRUD actions (role/permission management) and
 * runtime checks (hasPermission / requirePermission).
 *
 * Uses an ephemeral Postgres database. You can swap this with
 * a test container or a dedicated test schema.
 */

import { db } from '@/utils/db';
import {
  createRole,
  assignRoleToUser,
  addPermission,
  grantPermissionToRole,
  grantPermissionToUser,
  revokePermissionFromUser,
  revokePermissionFromRole,
} from '@/app/actions/roles';
import {
  getUserPermissions,
  hasPermission,
  requirePermission,
} from '@/app/actions/authz';
import {
  user,
  role,
  permission,
  userRole,
  rolePermissions,
  userPermission,
} from '@/db/schema';
// Note: rolePermissions is used, others are imported but not directly used in this file
import { eq } from 'drizzle-orm';

import { describe, vi, beforeAll, test, expect } from 'vitest';

// Mock redirect to capture redirects instead of terminating test
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

describe('Authorization system', () => {
  let userId: string;
  let roleId: number;
  let permIdEditSelf: number;
  let permIdAllAll: number;

  beforeAll(async () => {
    // Create fake user
    const [u] = await db
      .insert(user)
      .values({
        name: 'Test User',
        email: 'user@test.com',
        emailVerified: true,
      })
      .returning({ id: user.id });
    userId = u.id;

    // Clear any pre-existing roles / perms
    await db.delete(userRole);
    await db.delete(userPermission);
    await db.delete(userRole);
    await db.delete(userPermission);
    await db.delete(rolePermissions);
    await db.delete(role);
    await db.delete(permission);
    await db.delete(role);
    await db.delete(permission);
  });

  afterAll(async () => {
    await db.delete(userRole);
    await db.delete(userPermission);
    await db.delete(userRole);
    await db.delete(userPermission);
    await db.delete(rolePermissions);
    await db.delete(role);
    await db.delete(permission);
    await db.delete(role);
    await db.delete(permission);
  });

  // ─────────────────────────────────────────────

  test('should create roles and permissions', async () => {
    const role = await createRole('admin', 'Administrator');
    expect(role.success).toBe(true);
    expect(role.data).toBeDefined();
    roleId = role.data!;

    const permSelf = await addPermission('submission:edit:self');
    const permAllAll = await addPermission('submission:all:all');
    expect(permSelf.success).toBe(true);
    expect(permAllAll.success).toBe(true);

    permIdEditSelf = permSelf.data!;
    permIdAllAll = permAllAll.data!;
  });

  test('should assign a role to user', async () => {
    const result = await assignRoleToUser(userId, roleId);
    expect(result.success).toBe(true);

    const assigned = await db
      .select()
      .from(userRole)
      .where(eq(userRole.userId, userId));
    expect(assigned.length).toBe(1);
  });

  test('should grant permission to role', async () => {
    const result = await grantPermissionToRole(roleId, permIdEditSelf);
    expect(result.success).toBe(true);

    const assigned = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    expect(assigned.length).toBe(1);
  });

  test('should grant and revoke direct user permission', async () => {
    const grant = await grantPermissionToUser(userId, permIdAllAll);
    expect(grant.success).toBe(true);

    let perms = await db
      .select()
      .from(userPermission)
      .where(eq(userPermission.userId, userId));
    expect(perms.length).toBe(1);

    const revoke = await revokePermissionFromUser(userId, permIdAllAll);
    expect(revoke.success).toBe(true);

    perms = await db
      .select()
      .from(userPermission)
      .where(eq(userPermission.userId, userId));
    expect(perms.length).toBe(0);
  });

  // ─────────────────────────────────────────────
  // Runtime permission resolution
  // ─────────────────────────────────────────────

  test('should resolve permissions through roles', async () => {
    const res = await getUserPermissions(userId);
    expect(res.success).toBe(true);
    expect(res.data!.has('submission:edit:self')).toBe(true);
  });

  test('hasPermission should match exact and hierarchical permissions', async () => {
    // Exact match
    const exact = await hasPermission(userId, 'submission:edit:self');
    expect(exact).toBe(true);

    // Add a broader permission
    await grantPermissionToUser(userId, permIdAllAll);

    // hierarchical: entity:all:all covers everything
    const broad = await hasPermission(userId, 'submission:delete:self');
    expect(broad).toBe(true);
  });

  test('requirePermission should redirect when unauthorized', async () => {
    // Remove all permissions
    await db.delete(userPermission);
    await db.delete(userPermission);
    await db.delete(rolePermissions);

    let thrown: string | null = null;
    try {
      await requirePermission(userId, 'submission:edit:self');
    } catch (e) {
      thrown = (e as Error).message;
    }
    expect(thrown).toContain('/forbidden');
    expect(thrown).toContain('reason=');
  });

  test('requirePermission should allow authorized user', async () => {
    // Regrant broad permission
    await grantPermissionToUser(userId, permIdAllAll);
    let passed = false;
    try {
      await requirePermission(userId, 'submission:delete:all');
      passed = true;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      passed = false;
    }
    expect(passed).toBe(true);
  });

  test('revokePermissionFromRole removes role permission', async () => {
    await revokePermissionFromRole(roleId, permIdEditSelf);
    const remaining = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    expect(remaining.length).toBe(0);
  });
});
