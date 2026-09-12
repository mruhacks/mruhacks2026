import { cacheTag, cacheLife } from 'next/cache';
import { sql } from 'drizzle-orm';
import { db } from '@/utils/db';
import { user, role, permission, userRole } from '@/db/schema';

export const ADMIN_COUNTS_CACHE_TAG = 'admin-counts';

export type AdminCounts = {
  users: number;
  roles: number;
  permissions: number;
  assignments: number;
};

/**
 * Sitewide user/role/permission/assignment counts shown on the admin
 * overview tiles. Same numbers for every admin, so cached instead of
 * queried on every view. Invalidated by updateTag(ADMIN_COUNTS_CACHE_TAG)
 * wherever users, roles, permissions, or role assignments change.
 */
export async function getAdminCounts(): Promise<AdminCounts> {
  'use cache';
  cacheTag(ADMIN_COUNTS_CACHE_TAG);
  // updateTag() covers the mutation paths, but counts change with normal
  // admin use — 'minutes' (still App Shell-prefetchable) self-heals fast
  // in case any path was missed.
  cacheLife('minutes');

  const [userCount, roleCount, permCount, assignmentCount] = await Promise.all([
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(user),
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(role),
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(permission),
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(userRole),
  ]);

  return {
    users: userCount[0]?.c ?? 0,
    roles: roleCount[0]?.c ?? 0,
    permissions: permCount[0]?.c ?? 0,
    assignments: assignmentCount[0]?.c ?? 0,
  };
}
