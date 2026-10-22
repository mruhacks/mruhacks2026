import { describe, test, expect, beforeAll, vi } from 'vitest';
import { inArray } from 'drizzle-orm';

import { db } from '@/utils/db';
import { auditLog, permission, user, userPermission } from '@/db/schema';

vi.mock('@/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/auth')>()),
  getUser: vi.fn(),
}));

import { getUser } from '@/utils/auth';
import { listAuditLog, listAuditLogFacets } from '@/app/actions/audit-log';

async function makeUser(label: string): Promise<string> {
  const [u] = await db
    .insert(user)
    .values({
      name: `Audit Test ${label}`,
      email: `audit-test-${label}-${Date.now()}@example.com`,
      emailVerified: true,
    })
    .returning({ id: user.id });
  return u.id;
}

describe('audit log viewer actions', () => {
  // Unique per run so assertions aren't thrown off by other tests' entries.
  const tag = `test${Date.now()}`;
  let auditorId: string;
  let actorId: string;

  beforeAll(async () => {
    auditorId = await makeUser('auditor');
    actorId = await makeUser('actor');
    const [perm] = await db
      .insert(permission)
      .values({ slug: 'audit:read:all' })
      .onConflictDoUpdate({
        target: permission.slug,
        set: { slug: 'audit:read:all' },
      })
      .returning({ id: permission.id });
    await db.insert(userPermission).values({ userId: auditorId, permissionId: perm.id }).onConflictDoNothing();

    await db.insert(auditLog).values([
      {
        actorId,
        action: `${tag}.first`,
        targetType: 'user',
        targetId: actorId,
        metadata: { n: 1 },
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        actorId: null,
        action: `${tag}.second`,
        targetType: `${tag}-thing`,
        targetId: '42',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
      {
        actorId: auditorId,
        action: `${tag}.second`,
        targetType: `${tag}-thing`,
        targetId: '43',
        createdAt: new Date('2026-01-03T00:00:00Z'),
      },
    ]);
  });

  test('requires audit:read:all', async () => {
    vi.mocked(getUser).mockResolvedValue({
      id: await makeUser('outsider'),
    } as never);
    await expect(listAuditLog()).rejects.toThrow(/REDIRECT:\/forbidden/);
    await expect(listAuditLogFacets()).rejects.toThrow(/REDIRECT:\/forbidden/);
  });

  test('lists newest first with the actor joined in', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: auditorId } as never);
    const res = await listAuditLog({ search: tag });
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data!.total).toBe(3);
    expect(res.data!.entries.map((e) => e.targetId)).toEqual(['43', '42', actorId]);
    expect(res.data!.entries[1]!.actor).toBeNull();
    expect(res.data!.entries[2]!.actor).toMatchObject({
      id: actorId,
      name: 'Audit Test actor',
    });
    expect(res.data!.entries[2]!.metadata).toEqual({ n: 1 });
  });

  test('filters by action, target type, actor, and searches actor names', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: auditorId } as never);

    const byAction = await listAuditLog({ actions: [`${tag}.second`] });
    expect(byAction.success && byAction.data!.total).toBe(2);

    const byTarget = await listAuditLog({ targetTypes: [`${tag}-thing`] });
    expect(byTarget.success && byTarget.data!.total).toBe(2);

    const byActor = await listAuditLog({ search: tag, actorId });
    expect(byActor.success && byActor.data!.entries.map((e) => e.action)).toEqual([`${tag}.first`]);

    const byActorName = await listAuditLog({
      search: 'Audit Test auditor',
      actions: [`${tag}.second`],
    });
    expect(byActorName.success && byActorName.data!.entries.map((e) => e.targetId)).toEqual(['43']);
  });

  test('paginates and sorts ascending', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: auditorId } as never);
    const res = await listAuditLog({
      search: tag,
      pageSize: 2,
      page: 2,
      sortDirection: 'asc',
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data!.totalPages).toBe(2);
    expect(res.data!.entries.map((e) => e.targetId)).toEqual(['43']);
  });

  test('facets list every distinct action and target type', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: auditorId } as never);
    const res = await listAuditLogFacets();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data!.actions).toEqual(expect.arrayContaining([`${tag}.first`, `${tag}.second`]));
    expect(res.data!.actions.filter((a) => a === `${tag}.second`)).toHaveLength(1);
    expect(res.data!.targetTypes).toEqual(expect.arrayContaining(['user', `${tag}-thing`]));

    await db.delete(auditLog).where(inArray(auditLog.action, [`${tag}.first`, `${tag}.second`]));
  });
});
