/**
 * Verifies that each roles.ts action enforces the correct specific permission.
 *
 * Three scenarios per action:
 *   1. Unauthenticated (getUser → null) → fail('Not authenticated')
 *   2. Authenticated but missing required permission → throws REDIRECT:/forbidden
 *   3. Read-only permission is insufficient for write actions
 *
 * The happy-path (with correct permission) is covered in roles.test.ts.
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import { user, permission, userPermission } from '@/db/schema';

vi.mock('server-only', () => ({}));
vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));

import { getUser } from '@/utils/auth';
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

type MockUser = { id: string; email: string };

let noPermUserId: string;
let readOnlyRoleUserId: string; // has role:read:all but NOT role:write:all
let readOnlyPermUserId: string; // has permission:read:all but NOT permission:write:all

let noPermUser: MockUser;
let readOnlyRoleUser: MockUser;
let readOnlyPermUser: MockUser;

const FORBIDDEN = (perm: string) =>
  `REDIRECT:/forbidden?reason=missing_permission&permission=${perm}`;

beforeAll(async () => {
  const [noPerm] = await db
    .insert(user)
    .values({
      name: 'No Perm',
      email: 'rpe-noperm@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  const [roUser] = await db
    .insert(user)
    .values({
      name: 'Read Only Role User',
      email: 'rpe-ro-role@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });
  const [rpUser] = await db
    .insert(user)
    .values({
      name: 'Read Only Perm User',
      email: 'rpe-ro-perm@example.com',
      emailVerified: true,
    })
    .returning({ id: user.id });

  noPermUserId = noPerm.id;
  readOnlyRoleUserId = roUser.id;
  readOnlyPermUserId = rpUser.id;
  noPermUser = { id: noPermUserId, email: 'rpe-noperm@example.com' };
  readOnlyRoleUser = {
    id: readOnlyRoleUserId,
    email: 'rpe-ro-role@example.com',
  };
  readOnlyPermUser = {
    id: readOnlyPermUserId,
    email: 'rpe-ro-perm@example.com',
  };

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

  const roleReadId = await ensurePerm('role:read:all');
  const permReadId = await ensurePerm('permission:read:all');

  await db
    .insert(userPermission)
    .values({ userId: readOnlyRoleUserId, permissionId: roleReadId })
    .onConflictDoNothing();
  await db
    .insert(userPermission)
    .values({ userId: readOnlyPermUserId, permissionId: permReadId })
    .onConflictDoNothing();
});

afterAll(async () => {
  for (const uid of [noPermUserId, readOnlyRoleUserId, readOnlyPermUserId]) {
    await db.delete(userPermission).where(eq(userPermission.userId, uid));
    await db.delete(user).where(eq(user.id, uid));
  }
  await db.delete(permission).where(eq(permission.slug, 'role:read:all'));
  await db.delete(permission).where(eq(permission.slug, 'permission:read:all'));
});

// ─── listRoles — requires role:read:all ────────────────────────────────────────

describe('listRoles', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(listRoles()).resolves.toMatchObject({ success: false });
  });

  test('redirects to /forbidden for caller without role:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(listRoles()).rejects.toThrow(FORBIDDEN('role:read:all'));
  });
});

// ─── listPermissions — requires permission:read:all ───────────────────────────

describe('listPermissions', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(listPermissions()).resolves.toMatchObject({ success: false });
  });

  test('redirects to /forbidden for caller without permission:read:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(listPermissions()).rejects.toThrow(
      FORBIDDEN('permission:read:all'),
    );
  });
});

// ─── createRole — requires role:write:all ─────────────────────────────────────

describe('createRole', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(createRole('test-slug')).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without role:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(createRole('test-slug')).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });

  test('role:read:all alone is insufficient — redirects to /forbidden', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(readOnlyRoleUser as never);
    await expect(createRole('test-slug')).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });
});

// ─── deleteRole — requires role:write:all ─────────────────────────────────────

describe('deleteRole', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(deleteRole(999)).resolves.toMatchObject({ success: false });
  });

  test('redirects to /forbidden for caller without role:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(deleteRole(999)).rejects.toThrow(FORBIDDEN('role:write:all'));
  });

  test('role:read:all alone is insufficient — redirects to /forbidden', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(readOnlyRoleUser as never);
    await expect(deleteRole(999)).rejects.toThrow(FORBIDDEN('role:write:all'));
  });
});

// ─── updateRole — requires role:write:all ─────────────────────────────────────

describe('updateRole', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(updateRole(999, { slug: 'x' })).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without role:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(updateRole(999, { slug: 'x' })).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });
});

// ─── assignRoleToUser / revokeRoleFromUser — requires role:write:all ──────────

describe('assignRoleToUser', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(assignRoleToUser('uid', 1)).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without role:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(assignRoleToUser('uid', 1)).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });
});

describe('revokeRoleFromUser', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(revokeRoleFromUser('uid', 1)).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without role:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(revokeRoleFromUser('uid', 1)).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });
});

// ─── addPermission / deletePermission / updatePermission — requires permission:write:all

describe('addPermission', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(addPermission('test:perm', 'desc')).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without permission:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(addPermission('test:perm', 'desc')).rejects.toThrow(
      FORBIDDEN('permission:write:all'),
    );
  });

  test('permission:read:all alone is insufficient — redirects to /forbidden', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(readOnlyPermUser as never);
    await expect(addPermission('test:perm', 'desc')).rejects.toThrow(
      FORBIDDEN('permission:write:all'),
    );
  });
});

describe('deletePermission', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(deletePermission(999)).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without permission:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(deletePermission(999)).rejects.toThrow(
      FORBIDDEN('permission:write:all'),
    );
  });
});

describe('updatePermission', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(updatePermission(999, { slug: 'x' })).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without permission:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(updatePermission(999, { slug: 'x' })).rejects.toThrow(
      FORBIDDEN('permission:write:all'),
    );
  });
});

// ─── grantPermissionToRole / revokePermissionFromRole — requires role:write:all

describe('grantPermissionToRole', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(grantPermissionToRole(1, 1)).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without role:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(grantPermissionToRole(1, 1)).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });
});

describe('revokePermissionFromRole', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(revokePermissionFromRole(1, 1)).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without role:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(revokePermissionFromRole(1, 1)).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });
});

// ─── grantPermissionToUser / revokePermissionFromUser — requires permission:write:all

describe('grantPermissionToUser', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(grantPermissionToUser('uid', 1)).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without permission:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(grantPermissionToUser('uid', 1)).rejects.toThrow(
      FORBIDDEN('permission:write:all'),
    );
  });
});

describe('revokePermissionFromUser', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(revokePermissionFromUser('uid', 1)).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without permission:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(revokePermissionFromUser('uid', 1)).rejects.toThrow(
      FORBIDDEN('permission:write:all'),
    );
  });
});

// ─── setUserRoles — requires role:write:all ────────────────────────────────────

describe('setUserRoles', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(setUserRoles('uid', [])).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without role:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(setUserRoles('uid', [])).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });

  test('role:read:all alone is insufficient — redirects to /forbidden', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(readOnlyRoleUser as never);
    await expect(setUserRoles('uid', [])).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });
});

// ─── setUserDirectPermissions — requires permission:write:all ─────────────────

describe('setUserDirectPermissions', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(setUserDirectPermissions('uid', [])).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without permission:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(setUserDirectPermissions('uid', [])).rejects.toThrow(
      FORBIDDEN('permission:write:all'),
    );
  });

  test('permission:read:all alone is insufficient — redirects to /forbidden', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(readOnlyPermUser as never);
    await expect(setUserDirectPermissions('uid', [])).rejects.toThrow(
      FORBIDDEN('permission:write:all'),
    );
  });
});

// ─── setRolePermissions — requires role:write:all ─────────────────────────────

describe('setRolePermissions', () => {
  test('returns fail for unauthenticated caller', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(setRolePermissions(1, [])).resolves.toMatchObject({
      success: false,
    });
  });

  test('redirects to /forbidden for caller without role:write:all', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(noPermUser as never);
    await expect(setRolePermissions(1, [])).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });

  test('role:read:all alone is insufficient — redirects to /forbidden', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(readOnlyRoleUser as never);
    await expect(setRolePermissions(1, [])).rejects.toThrow(
      FORBIDDEN('role:write:all'),
    );
  });
});
