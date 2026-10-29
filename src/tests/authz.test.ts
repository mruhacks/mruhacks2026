/**
 * Authorization module test suite
 *
 * Tests runtime permission resolution (loadUserPermissions / hasPermission /
 * requirePermission). Role and permission rows are written directly; the
 * admin actions that manage them have their own suites.
 */

import { db } from '@/utils/db';
import * as Rbac from '@/lib/rbac/server';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';

import { describe, vi, beforeAll, afterAll, test, expect } from 'vitest';
vi.mock('server-only', () => ({}));

// Mock redirect to capture redirects instead of terminating test
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

describe('Authorization system', () => {
  let userId: string;
  let roleId: number;
  let permIdAllAll: number;

  beforeAll(async () => {
    const [u] = await db
      .insert(schema.user)
      .values({
        name: 'Test User',
        email: 'user@test.com',
        emailVerified: true,
      })
      .returning({ id: schema.user.id });
    userId = u.id;
    // Clear any pre-existing roles / perms
    await db.delete(schema.userRole);
    await db.delete(schema.userPermission);
    await db.delete(schema.rolePermissions);
    await db.delete(schema.role);
    await db.delete(schema.permission);

    const [role] = await db.insert(schema.role).values({ slug: 'admin' }).returning({ id: schema.role.id });
    roleId = role.id;
    const [editSelf] = await db
      .insert(schema.permission)
      .values({ slug: 'submission:edit:self' })
      .returning({ id: schema.permission.id });
    const [allAll] = await db
      .insert(schema.permission)
      .values({ slug: 'submission:all:all' })
      .returning({ id: schema.permission.id });
    permIdAllAll = allAll.id;
    await db.insert(schema.rolePermissions).values({ roleId, permissionId: editSelf.id });
    await db.insert(schema.userRole).values({ userId, roleId });
  });

  afterAll(async () => {
    await db.delete(schema.userRole);
    await db.delete(schema.userPermission);
    await db.delete(schema.rolePermissions);
    await db.delete(schema.role);
    await db.delete(schema.permission);
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  test('should resolve permissions through roles', async () => {
    const perms = await Rbac.loadUserPermissions(userId);
    expect(perms.has('submission:edit:self')).toBe(true);
  });

  test('hasPermission should match exact and hierarchical permissions', async () => {
    // Exact match
    const exact = await Rbac.hasPermission(userId, 'submission:edit:self');
    expect(exact).toBe(true);

    // Add a broader permission
    await db.insert(schema.userPermission).values({ userId, permissionId: permIdAllAll });

    // hierarchical: entity:all:all covers everything
    const broad = await Rbac.hasPermission(userId, 'submission:delete:self');
    expect(broad).toBe(true);
  });

  test('requirePermission should redirect when unauthorized', async () => {
    // Remove all permissions
    await db.delete(schema.userPermission);
    await db.delete(schema.rolePermissions);

    let thrown: string | null = null;
    try {
      await Rbac.requirePermission(userId, 'submission:edit:self');
    } catch (e) {
      thrown = (e as Error).message;
    }
    expect(thrown).toContain('/forbidden');
    expect(thrown).toContain('reason=');
  });

  test('requirePermission should allow authorized user', async () => {
    // Regrant broad permission
    await db.insert(schema.userPermission).values({ userId, permissionId: permIdAllAll });
    // Throws the forbidden redirect if the check fails.
    await Rbac.requirePermission(userId, 'submission:delete:all');
  });
});
