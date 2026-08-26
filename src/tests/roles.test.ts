import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
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
vi.mock('server-only', () => ({}));
vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
import {
  listRoles,
  listPermissions,
  createRole,
  deleteRole,
  updateRole,
  addPermission,
  deletePermission,
  updatePermission,
  assignRoleToUser,
  revokeRoleFromUser,
  grantPermissionToRole,
  revokePermissionFromRole,
  grantPermissionToUser,
  revokePermissionFromUser,
  setUserRoles,
  setUserDirectPermissions,
  setRolePermissions,
} from '@/app/actions/roles';
import { getUser } from '@/utils/auth';
import { unwrap } from './unwrap';

let testUserId: string;
let actorUserId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(user)
    .values({
      name: 'Roles Test User',
      email: 'roles-test@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  testUserId = u.id;
  const [actor] = await db
    .insert(user)
    .values({
      name: 'Roles Test Admin',
      email: 'roles-admin@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  actorUserId = actor.id;
  const privilegeSlugs = ['role:all:all', 'permission:all:all'];
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
      .values({ userId: actorUserId, permissionId })
      .onConflictDoNothing();
  }
  vi.mocked(getUser).mockResolvedValue({ id: actorUserId } as never);
});

afterAll(async () => {
  await db.delete(userRole).where(eq(userRole.userId, testUserId));
  await db.delete(userPermission).where(eq(userPermission.userId, testUserId));
  await db.delete(userPermission).where(eq(userPermission.userId, actorUserId));
  await db.delete(user).where(eq(user.id, testUserId));
  await db.delete(user).where(eq(user.id, actorUserId));
  await db.delete(permission).where(eq(permission.slug, 'role:all:all'));
  await db.delete(permission).where(eq(permission.slug, 'permission:all:all'));
});

describe('createRole', () => {
  test('creates a new role and returns its ID', async () => {
    const result = await createRole('test-organizer', 'Test organizer role');
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data).toBeTypeOf('number');

    const [row] = await db.select().from(role).where(eq(role.id, result.data!));
    expect(row.slug).toBe('test-organizer');
    expect(row.description).toBe('Test organizer role');

    await db.delete(role).where(eq(role.id, result.data!));
  });

  test('duplicate slug returns success with undefined ID (onConflictDoNothing)', async () => {
    const first = await createRole('test-duplicate-role');
    expect(first.success).toBe(true);
    if (!first.success) throw new Error(first.error);
    expect(first.data).toBeTypeOf('number');

    const second = await createRole('test-duplicate-role');
    expect(second.success).toBe(true);
    if (!second.success) throw new Error(second.error);
    expect(second.data).toBeUndefined();

    await db.delete(role).where(eq(role.id, first.data!));
  });
});

describe('deleteRole', () => {
  test('deletes an existing role', async () => {
    const roleId = unwrap(await createRole('test-to-delete'));
    await deleteRole(roleId);
    const rows = await db.select().from(role).where(eq(role.id, roleId!));
    expect(rows).toHaveLength(0);
  });

  test('deleting a nonexistent role returns success', async () => {
    const result = await deleteRole(999999);
    expect(result.success).toBe(true);
  });
});

describe('updateRole', () => {
  test('updates role slug and description', async () => {
    const roleId = unwrap(await createRole('test-before-update'));
    await updateRole(roleId!, {
      slug: 'test-after-update',
      description: 'Updated desc',
    });

    const [row] = await db.select().from(role).where(eq(role.id, roleId!));
    expect(row.slug).toBe('test-after-update');
    expect(row.description).toBe('Updated desc');

    await db.delete(role).where(eq(role.id, roleId!));
  });

  test('auto-lowercases the slug', async () => {
    const roleId = unwrap(await createRole('test-case-role'));
    await updateRole(roleId!, { slug: 'TEST-CASE-ROLE' });

    const [row] = await db.select().from(role).where(eq(role.id, roleId!));
    expect(row.slug).toBe('test-case-role');

    await db.delete(role).where(eq(role.id, roleId!));
  });

  test('can set description to null', async () => {
    const roleId = unwrap(await createRole('test-null-desc', 'some desc'));
    await updateRole(roleId!, { description: null });

    const [row] = await db.select().from(role).where(eq(role.id, roleId!));
    expect(row.description).toBeNull();

    await db.delete(role).where(eq(role.id, roleId!));
  });

  test('empty patch object is a no-op and returns success', async () => {
    const roleId = unwrap(await createRole('test-noop-role'));
    const result = await updateRole(roleId!, {});
    expect(result.success).toBe(true);

    await db.delete(role).where(eq(role.id, roleId!));
  });
});

describe('listRoles', () => {
  test('returns an array of roles with permissionCount and userCount', async () => {
    const roleId = unwrap(await createRole('test-listed-role'));
    const result = await listRoles();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    const found = result.data!.find((r) => r.id === roleId);
    expect(found).toBeDefined();
    expect(found!.permissionCount).toBe(0);
    expect(found!.userCount).toBe(0);

    await db.delete(role).where(eq(role.id, roleId!));
  });
});

describe('addPermission / deletePermission / updatePermission / listPermissions', () => {
  test('adds a permission and returns its ID', async () => {
    const result = await addPermission('test:read:all', 'A test permission');
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data).toBeTypeOf('number');

    await db.delete(permission).where(eq(permission.id, result.data!));
  });

  test('duplicate permission slug returns success with undefined ID', async () => {
    const first = await addPermission('test:dup:all');
    const second = await addPermission('test:dup:all');
    if (!first.success) throw new Error(first.error);
    expect(second.success).toBe(true);
    if (!second.success) throw new Error(second.error);
    expect(second.data).toBeUndefined();

    await db.delete(permission).where(eq(permission.id, first.data!));
  });

  test('deletes a permission', async () => {
    const permId = unwrap(await addPermission('test:delete-me:all'));
    await deletePermission(permId);
    const rows = await db
      .select()
      .from(permission)
      .where(eq(permission.id, permId!));
    expect(rows).toHaveLength(0);
  });

  test('updatePermission auto-lowercases the slug', async () => {
    const permId = unwrap(await addPermission('test:lowercase:all'));
    await updatePermission(permId, { slug: 'TEST:LOWERCASE:ALL' });
    const [row] = await db
      .select()
      .from(permission)
      .where(eq(permission.id, permId!));
    expect(row.slug).toBe('test:lowercase:all');
    await db.delete(permission).where(eq(permission.id, permId!));
  });

  test('listPermissions returns all permissions in alphabetical order', async () => {
    const p1 = unwrap(await addPermission('zzz:test:all'));
    const p2 = unwrap(await addPermission('aaa:test:all'));
    const result = await listPermissions();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    const slugs = result.data!.map((p) => p.slug);
    const idx1 = slugs.indexOf('aaa:test:all');
    const idx2 = slugs.indexOf('zzz:test:all');
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(idx2);
    await db.delete(permission).where(eq(permission.id, p1!));
    await db.delete(permission).where(eq(permission.id, p2!));
  });
});

describe('assignRoleToUser / revokeRoleFromUser', () => {
  test('assigns a role to a user', async () => {
    const roleId = unwrap(await createRole('test-assign-role'));
    await assignRoleToUser(testUserId, roleId!);

    const rows = await db
      .select()
      .from(userRole)
      .where(eq(userRole.userId, testUserId));
    expect(rows.some((r) => r.roleId === roleId)).toBe(true);

    await db.delete(userRole).where(eq(userRole.userId, testUserId));
    await db.delete(role).where(eq(role.id, roleId!));
  });

  test('assigning same role twice is idempotent', async () => {
    const roleId = unwrap(await createRole('test-idempotent-role'));
    await assignRoleToUser(testUserId, roleId!);
    const result = await assignRoleToUser(testUserId, roleId!);
    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(userRole)
      .where(eq(userRole.userId, testUserId));
    expect(rows.filter((r) => r.roleId === roleId)).toHaveLength(1);

    await db.delete(userRole).where(eq(userRole.userId, testUserId));
    await db.delete(role).where(eq(role.id, roleId!));
  });

  test('revokes a role from a user', async () => {
    const roleId = unwrap(await createRole('test-revoke-role'));
    await assignRoleToUser(testUserId, roleId!);
    await revokeRoleFromUser(testUserId, roleId!);

    const rows = await db
      .select()
      .from(userRole)
      .where(eq(userRole.userId, testUserId));
    expect(rows.some((r) => r.roleId === roleId)).toBe(false);

    await db.delete(role).where(eq(role.id, roleId!));
  });
});

describe('grantPermissionToRole / revokePermissionFromRole', () => {
  test('grants a permission to a role', async () => {
    const roleId = unwrap(await createRole('test-grant-role'));
    const permId = unwrap(await addPermission('test:grant:role'));
    await grantPermissionToRole(roleId!, permId!);

    const rows = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId!));
    expect(rows.some((r) => r.permissionId === permId)).toBe(true);

    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId!));
    await db.delete(permission).where(eq(permission.id, permId!));
    await db.delete(role).where(eq(role.id, roleId!));
  });

  test('granting same permission twice is idempotent', async () => {
    const roleId = unwrap(await createRole('test-grant-idempotent-role'));
    const permId = unwrap(await addPermission('test:grant:idempotent'));
    await grantPermissionToRole(roleId!, permId!);
    const result = await grantPermissionToRole(roleId!, permId!);
    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId!));
    expect(rows.filter((r) => r.permissionId === permId)).toHaveLength(1);

    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId!));
    await db.delete(permission).where(eq(permission.id, permId!));
    await db.delete(role).where(eq(role.id, roleId!));
  });

  test('revokes a permission from a role', async () => {
    const roleId = unwrap(await createRole('test-revoke-perm-role'));
    const permId = unwrap(await addPermission('test:revoke:role'));
    await grantPermissionToRole(roleId!, permId!);
    await revokePermissionFromRole(roleId!, permId!);

    const rows = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId!));
    expect(rows.some((r) => r.permissionId === permId)).toBe(false);

    await db.delete(permission).where(eq(permission.id, permId!));
    await db.delete(role).where(eq(role.id, roleId!));
  });
});

describe('grantPermissionToUser / revokePermissionFromUser', () => {
  test('grants a direct permission to a user', async () => {
    const permId = unwrap(await addPermission('test:grant:user'));
    await grantPermissionToUser(testUserId, permId!);

    const rows = await db
      .select()
      .from(userPermission)
      .where(eq(userPermission.userId, testUserId));
    expect(rows.some((r) => r.permissionId === permId)).toBe(true);

    await db
      .delete(userPermission)
      .where(eq(userPermission.userId, testUserId));
    await db.delete(permission).where(eq(permission.id, permId!));
  });

  test('revokes a direct permission from a user', async () => {
    const permId = unwrap(await addPermission('test:revoke:user'));
    await grantPermissionToUser(testUserId, permId!);
    await revokePermissionFromUser(testUserId, permId!);

    const rows = await db
      .select()
      .from(userPermission)
      .where(eq(userPermission.userId, testUserId));
    expect(rows.some((r) => r.permissionId === permId)).toBe(false);

    await db.delete(permission).where(eq(permission.id, permId!));
  });
});

describe('setUserRoles', () => {
  test('replaces all user roles', async () => {
    const r1 = unwrap(await createRole('test-set-role-1'));
    const r2 = unwrap(await createRole('test-set-role-2'));

    await setUserRoles(testUserId, [r1!]);
    let rows = await db
      .select()
      .from(userRole)
      .where(eq(userRole.userId, testUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0].roleId).toBe(r1);

    await setUserRoles(testUserId, [r2!]);
    rows = await db
      .select()
      .from(userRole)
      .where(eq(userRole.userId, testUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0].roleId).toBe(r2);

    await db.delete(userRole).where(eq(userRole.userId, testUserId));
    await db.delete(role).where(eq(role.id, r1!));
    await db.delete(role).where(eq(role.id, r2!));
  });

  test('clearing all roles (empty array) sets Better Auth role to user', async () => {
    const roleId = unwrap(await createRole('test-set-admin-role'));
    await setUserRoles(testUserId, [roleId!]);
    await setUserRoles(testUserId, []);

    const rows = await db
      .select()
      .from(userRole)
      .where(eq(userRole.userId, testUserId));
    expect(rows).toHaveLength(0);

    const [u] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, testUserId));
    expect(u.role).toBe('user');

    await db.delete(role).where(eq(role.id, roleId!));
  });

  test('assigning a role with slug "admin" sets Better Auth role to admin', async () => {
    const adminRoleId = unwrap(await createRole('admin'));

    await setUserRoles(testUserId, [adminRoleId!]);

    const [u] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, testUserId));
    expect(u.role).toBe('admin');

    await db.delete(userRole).where(eq(userRole.userId, testUserId));
    await db.delete(role).where(eq(role.id, adminRoleId!));
    await db.update(user).set({ role: 'user' }).where(eq(user.id, testUserId));
  });
});

describe('setUserDirectPermissions', () => {
  test('replaces all user direct permissions', async () => {
    const p1 = unwrap(await addPermission('test:set-direct:p1'));
    const p2 = unwrap(await addPermission('test:set-direct:p2'));

    await setUserDirectPermissions(testUserId, [p1!, p2!]);
    let rows = await db
      .select()
      .from(userPermission)
      .where(eq(userPermission.userId, testUserId));
    expect(rows).toHaveLength(2);

    await setUserDirectPermissions(testUserId, [p1!]);
    rows = await db
      .select()
      .from(userPermission)
      .where(eq(userPermission.userId, testUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0].permissionId).toBe(p1);

    await db
      .delete(userPermission)
      .where(eq(userPermission.userId, testUserId));
    await db.delete(permission).where(eq(permission.id, p1!));
    await db.delete(permission).where(eq(permission.id, p2!));
  });

  test('clears all permissions when given empty array', async () => {
    const permId = unwrap(await addPermission('test:set-direct:clear'));
    await setUserDirectPermissions(testUserId, [permId!]);
    await setUserDirectPermissions(testUserId, []);

    const rows = await db
      .select()
      .from(userPermission)
      .where(eq(userPermission.userId, testUserId));
    expect(rows).toHaveLength(0);

    await db.delete(permission).where(eq(permission.id, permId!));
  });
});

describe('setRolePermissions', () => {
  test('replaces all permissions for a role', async () => {
    const roleId = unwrap(await createRole('test-set-role-perms'));
    const p1 = unwrap(await addPermission('test:set-role-perms:p1'));
    const p2 = unwrap(await addPermission('test:set-role-perms:p2'));

    await setRolePermissions(roleId!, [p1!, p2!]);
    let rows = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId!));
    expect(rows).toHaveLength(2);

    await setRolePermissions(roleId!, [p1!]);
    rows = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId!));
    expect(rows).toHaveLength(1);
    expect(rows[0].permissionId).toBe(p1);

    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId!));
    await db.delete(permission).where(eq(permission.id, p1!));
    await db.delete(permission).where(eq(permission.id, p2!));
    await db.delete(role).where(eq(role.id, roleId!));
  });

  test('clears all role permissions when given empty array', async () => {
    const roleId = unwrap(await createRole('test-set-role-perms-clear'));
    const permId = unwrap(await addPermission('test:set-role-perms:clear'));

    await setRolePermissions(roleId!, [permId!]);
    await setRolePermissions(roleId!, []);

    const rows = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId!));
    expect(rows).toHaveLength(0);

    await db.delete(permission).where(eq(permission.id, permId!));
    await db.delete(role).where(eq(role.id, roleId!));
  });
});
