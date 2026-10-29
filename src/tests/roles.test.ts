import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
vi.mock('server-only', () => ({}));
vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({ updateTag: vi.fn() }));
import {
  listRoles,
  listPermissions,
  createRole,
  deleteRole,
  updateRole,
  deletePermission,
  updatePermission,
  setRolePermissions,
} from '@/app/actions/roles';
import { getUser } from '@/utils/auth';
import { unwrap } from '@/tests/unwrap';

let testUserId: string;
let actorUserId: string;

async function insertPermission(slug: string): Promise<number> {
  const [row] = await db.insert(schema.permission).values({ slug }).returning({ id: schema.permission.id });
  return row.id;
}

beforeAll(async () => {
  const [u] = await db
    .insert(schema.user)
    .values({
      name: 'Roles Test User',
      email: 'roles-test@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  testUserId = u.id;
  const [actor] = await db
    .insert(schema.user)
    .values({
      name: 'Roles Test Admin',
      email: 'roles-admin@example.com',
      emailVerified: true,
    })
    .returning({ id: schema.user.id });
  actorUserId = actor.id;
  // `all:all:all` because granting a permission requires holding it.
  const privilegeSlugs = ['role:all:all', 'permission:all:all', 'all:all:all'];
  for (const slug of privilegeSlugs) {
    const [created] = await db
      .insert(schema.permission)
      .values({ slug })
      .onConflictDoNothing()
      .returning({ id: schema.permission.id });
    const permissionId =
      created?.id ??
      (
        await db
          .select({ id: schema.permission.id })
          .from(schema.permission)
          .where(eq(schema.permission.slug, slug))
          .limit(1)
      )[0]!.id;
    await db.insert(schema.userPermission).values({ userId: actorUserId, permissionId }).onConflictDoNothing();
  }
  vi.mocked(getUser).mockResolvedValue({ id: actorUserId } as never);
});

afterAll(async () => {
  await db.delete(schema.userRole).where(eq(schema.userRole.userId, testUserId));
  await db.delete(schema.userPermission).where(eq(schema.userPermission.userId, testUserId));
  await db.delete(schema.userPermission).where(eq(schema.userPermission.userId, actorUserId));
  await db.delete(schema.user).where(eq(schema.user.id, testUserId));
  await db.delete(schema.user).where(eq(schema.user.id, actorUserId));
  await db.delete(schema.permission).where(eq(schema.permission.slug, 'role:all:all'));
  await db.delete(schema.permission).where(eq(schema.permission.slug, 'permission:all:all'));
  await db.delete(schema.permission).where(eq(schema.permission.slug, 'all:all:all'));
});

describe('createRole', () => {
  test('creates a new role and returns its ID', async () => {
    const result = await createRole('test-organizer', 'Test organizer role');
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data).toBeTypeOf('number');

    const [row] = await db.select().from(schema.role).where(eq(schema.role.id, result.data!));
    expect(row.slug).toBe('test-organizer');
    expect(row.description).toBe('Test organizer role');

    await db.delete(schema.role).where(eq(schema.role.id, result.data!));
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

    await db.delete(schema.role).where(eq(schema.role.id, first.data!));
  });
});

describe('deleteRole', () => {
  test('deletes an existing role', async () => {
    const roleId = unwrap(await createRole('test-to-delete'));
    await deleteRole(roleId);
    const rows = await db.select().from(schema.role).where(eq(schema.role.id, roleId!));
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

    const [row] = await db.select().from(schema.role).where(eq(schema.role.id, roleId!));
    expect(row.slug).toBe('test-after-update');
    expect(row.description).toBe('Updated desc');

    await db.delete(schema.role).where(eq(schema.role.id, roleId!));
  });

  test('auto-lowercases the slug', async () => {
    const roleId = unwrap(await createRole('test-case-role'));
    await updateRole(roleId!, { slug: 'TEST-CASE-ROLE' });

    const [row] = await db.select().from(schema.role).where(eq(schema.role.id, roleId!));
    expect(row.slug).toBe('test-case-role');

    await db.delete(schema.role).where(eq(schema.role.id, roleId!));
  });

  test('can set description to null', async () => {
    const roleId = unwrap(await createRole('test-null-desc', 'some desc'));
    await updateRole(roleId!, { description: null });

    const [row] = await db.select().from(schema.role).where(eq(schema.role.id, roleId!));
    expect(row.description).toBeNull();

    await db.delete(schema.role).where(eq(schema.role.id, roleId!));
  });

  test('empty patch object is a no-op and returns success', async () => {
    const roleId = unwrap(await createRole('test-noop-role'));
    const result = await updateRole(roleId!, {});
    expect(result.success).toBe(true);

    await db.delete(schema.role).where(eq(schema.role.id, roleId!));
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

    await db.delete(schema.role).where(eq(schema.role.id, roleId!));
  });
});

describe('deletePermission / updatePermission / listPermissions', () => {
  test('deletes a permission', async () => {
    const permId = await insertPermission('test:delete-me:all');
    await deletePermission(permId);
    const rows = await db.select().from(schema.permission).where(eq(schema.permission.id, permId!));
    expect(rows).toHaveLength(0);
  });

  test('updatePermission auto-lowercases the slug', async () => {
    const permId = await insertPermission('test:lowercase:all');
    await updatePermission(permId, { slug: 'TEST:LOWERCASE:ALL' });
    const [row] = await db.select().from(schema.permission).where(eq(schema.permission.id, permId!));
    expect(row.slug).toBe('test:lowercase:all');
    await db.delete(schema.permission).where(eq(schema.permission.id, permId!));
  });

  test('listPermissions returns all permissions in alphabetical order', async () => {
    const p1 = await insertPermission('zzz:test:all');
    const p2 = await insertPermission('aaa:test:all');
    const result = await listPermissions();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    const slugs = result.data!.map((p) => p.slug);
    const idx1 = slugs.indexOf('aaa:test:all');
    const idx2 = slugs.indexOf('zzz:test:all');
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(idx2);
    await db.delete(schema.permission).where(eq(schema.permission.id, p1!));
    await db.delete(schema.permission).where(eq(schema.permission.id, p2!));
  });
});

describe('setRolePermissions', () => {
  test('replaces all permissions for a role', async () => {
    const roleId = unwrap(await createRole('test-set-role-perms'));
    const p1 = await insertPermission('test:set-role-perms:p1');
    const p2 = await insertPermission('test:set-role-perms:p2');

    await setRolePermissions(roleId!, [p1!, p2!]);
    let rows = await db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId!));
    expect(rows).toHaveLength(2);

    await setRolePermissions(roleId!, [p1!]);
    rows = await db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId!));
    expect(rows).toHaveLength(1);
    expect(rows[0].permissionId).toBe(p1);

    await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId!));
    await db.delete(schema.permission).where(eq(schema.permission.id, p1!));
    await db.delete(schema.permission).where(eq(schema.permission.id, p2!));
    await db.delete(schema.role).where(eq(schema.role.id, roleId!));
  });

  test('clears all role permissions when given empty array', async () => {
    const roleId = unwrap(await createRole('test-set-role-perms-clear'));
    const permId = await insertPermission('test:set-role-perms:clear');

    await setRolePermissions(roleId!, [permId!]);
    await setRolePermissions(roleId!, []);

    const rows = await db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId!));
    expect(rows).toHaveLength(0);

    await db.delete(schema.permission).where(eq(schema.permission.id, permId!));
    await db.delete(schema.role).where(eq(schema.role.id, roleId!));
  });
});
