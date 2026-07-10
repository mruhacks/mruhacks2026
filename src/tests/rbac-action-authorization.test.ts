import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  unstable_rethrow: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import { getRolePermissions } from '@/app/actions/authz';
import { listPermissions, listRoles } from '@/app/actions/roles';

describe('RBAC action authorization', () => {
  beforeEach(() => {
    vi.mocked(getUser).mockResolvedValue(null);
  });

  test('does not expose roles to unauthenticated callers', async () => {
    await expect(listRoles()).resolves.toMatchObject({ success: false });
  });

  test('does not expose permissions to unauthenticated callers', async () => {
    await expect(listPermissions()).resolves.toMatchObject({ success: false });
  });

  test('does not expose role permissions to unauthenticated callers', async () => {
    await expect(getRolePermissions(1)).resolves.toMatchObject({
      success: false,
    });
  });
});
