import { cacheTag, cacheLife } from 'next/cache';
import { eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/utils/db';
import * as schema from '@/db/schema';
import { EVENTS_CACHE_TAG } from '@/lib/events';

export const ADMIN_COUNTS_CACHE_TAG = 'admin-counts';

export type AdminCounts = {
  users: number;
  roles: number;
  permissions: number;
  assignments: number;
  events: number;
  campaigns: number;
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
 * role assignments change or a campaign is created or deleted, and by
 * updateTag(EVENTS_CACHE_TAG) wherever an event is created or edited.
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

  const [userCount, roleCount, permCount, assignmentCount, eventCount, featuredRows, campaignCount] = await Promise.all(
    [
      db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(schema.user),
      db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(schema.role),
      db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(schema.permission),
      db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(schema.userRole),
      // Top-level only: sub-events would inflate a number an admin reads as
      // "how many events are there".
      db
        .select({ c: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(schema.events)
        .where(isNull(schema.events.parentEventId)),
      db
        .select({
          id: schema.events.id,
          slug: schema.events.slug,
          name: schema.events.name,
          applications: sql<number>`COUNT(${schema.eventParticipants.id})`.mapWith(Number),
        })
        .from(schema.events)
        .leftJoin(schema.eventParticipants, eq(schema.eventParticipants.eventId, schema.events.id))
        .where(eq(schema.events.isFeatured, true))
        .groupBy(schema.events.id, schema.events.slug, schema.events.name)
        .limit(1),
      db.select({ c: sql<number>`COUNT(*)`.mapWith(Number) }).from(schema.campaigns),
    ],
  );

  const featured = featuredRows[0];

  return {
    users: userCount[0]?.c ?? 0,
    roles: roleCount[0]?.c ?? 0,
    permissions: permCount[0]?.c ?? 0,
    assignments: assignmentCount[0]?.c ?? 0,
    events: eventCount[0]?.c ?? 0,
    campaigns: campaignCount[0]?.c ?? 0,
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
