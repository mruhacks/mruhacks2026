import { cacheTag, cacheLife } from 'next/cache';
import { eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/utils/db';
import {
  user,
  role,
  permission,
  userRole,
  events,
  eventApplications,
} from '@/db/schema';
import { EVENTS_CACHE_TAG } from '@/lib/events';

export const ADMIN_COUNTS_CACHE_TAG = 'admin-counts';

export type AdminCounts = {
  users: number;
  roles: number;
  permissions: number;
  assignments: number;
  events: number;
  /** The single isFeatured event plus its application total, or null if none is featured. */
  featuredEvent: {
    id: string;
    slug: string | null;
    name: string;
    applications: number;
  } | null;
};

/**
 * Sitewide counts shown on the admin overview tiles. Same numbers for every
 * admin, so cached instead of queried on every view. Invalidated by
 * updateTag(ADMIN_COUNTS_CACHE_TAG) wherever users, roles, permissions, or
 * role assignments change, and by updateTag(EVENTS_CACHE_TAG) wherever an
 * event is created or edited.
 */
export async function getAdminCounts(): Promise<AdminCounts> {
  'use cache';
  cacheTag(ADMIN_COUNTS_CACHE_TAG);
  cacheTag(EVENTS_CACHE_TAG);
  // updateTag() covers the mutation paths, but counts change with normal
  // admin use — and the featured event's application total moves whenever an
  // applicant submits, which no admin tag covers — so 'minutes' (still App
  // Shell-prefetchable) self-heals fast.
  cacheLife('minutes');

  const [
    userCount,
    roleCount,
    permCount,
    assignmentCount,
    eventCount,
    featuredRows,
  ] = await Promise.all([
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(user),
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(role),
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(permission),
    db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(userRole),
    // Top-level only: sub-events would inflate a number an admin reads as
    // "how many events are there".
    db
      .select({ c: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(events)
      .where(isNull(events.parentEventId)),
    db
      .select({
        id: events.id,
        slug: events.slug,
        name: events.name,
        applications: sql<number>`COUNT(${eventApplications.id})`.mapWith(
          Number,
        ),
      })
      .from(events)
      .leftJoin(eventApplications, eq(eventApplications.eventId, events.id))
      .where(eq(events.isFeatured, true))
      .groupBy(events.id, events.slug, events.name)
      .limit(1),
  ]);

  const featured = featuredRows[0];

  return {
    users: userCount[0]?.c ?? 0,
    roles: roleCount[0]?.c ?? 0,
    permissions: permCount[0]?.c ?? 0,
    assignments: assignmentCount[0]?.c ?? 0,
    events: eventCount[0]?.c ?? 0,
    featuredEvent: featured
      ? {
          id: featured.id,
          slug: featured.slug,
          name: featured.name,
          applications: featured.applications,
        }
      : null,
  };
}
