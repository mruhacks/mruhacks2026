/**
 * The seeded `marketing` role: it can reach email campaigns, but not event
 * settings or applicant answers — the two things the issue calls out.
 */
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import * as Rbac from '@/lib/rbac/server';
import { seedStaticTables } from '../../scripts/seed-static';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));

import { getUser } from '@/utils/auth';

let marketingUserId: string;

async function userWithRole(slug: string, email: string): Promise<string> {
  const [row] = await db
    .insert(schema.user)
    .values({ name: slug, email, emailVerified: true })
    .returning({ id: schema.user.id });
  const [found] = await db.select().from(schema.role).where(eq(schema.role.slug, slug));
  await db.insert(schema.userRole).values({ userId: row.id, roleId: found.id });
  return row.id;
}

beforeAll(async () => {
  await seedStaticTables();
  marketingUserId = await userWithRole('marketing', 'campaign-perms-marketing@example.com');
}, 30_000);

describe('marketing role', () => {
  test('holds exactly campaign read/write/send plus aggregate stats', async () => {
    const permissions = await Rbac.loadUserPermissions(marketingUserId);
    expect([...permissions].sort()).toEqual([
      'application:stats:all',
      'campaign:read:all',
      'campaign:send:all',
      'campaign:write:all',
    ]);
  });

  test('can open /dashboard/admin/campaigns', async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: marketingUserId,
    } as Awaited<ReturnType<typeof getUser>>);
    await expect(Rbac.requireAuthWithPermission('campaign:read:all')).resolves.toMatchObject({ id: marketingUserId });
  });

  test("can't open event settings or applicant answers", async () => {
    await expect(Rbac.requirePermission(marketingUserId, 'event:manage:all')).rejects.toThrow(/REDIRECT:\/forbidden/);
    await expect(Rbac.requirePermission(marketingUserId, 'application:read:all')).rejects.toThrow(
      /REDIRECT:\/forbidden/,
    );
  });

  test("can't send operational email", async () => {
    expect(await Rbac.hasPermission(marketingUserId, 'campaign:operational:all')).toBe(false);
  });
});

describe('admin and organizer roles', () => {
  test.each(['admin', 'organizer'])('%s holds every campaign permission', async (slug) => {
    const id = await userWithRole(slug, `campaign-perms-${slug}@example.com`);
    for (const permission of [
      'campaign:read:all',
      'campaign:write:all',
      'campaign:send:all',
      'campaign:operational:all',
    ]) {
      expect(await Rbac.hasPermission(id, permission)).toBe(true);
    }
  });
});
