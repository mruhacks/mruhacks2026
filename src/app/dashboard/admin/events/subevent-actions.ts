/**
 * Server actions for an event's sub-events — the meals, workshops and
 * ceremonies that happen inside it and can be checked into separately.
 *
 * A sub-event is a child `events` row, so these ride on `event:manage` like
 * every other write to that table. There is deliberately no `updateSubevent`:
 * editing one goes through the ordinary event settings form at
 * `/dashboard/admin/events/<subeventId>/settings`, which is the whole point of
 * modelling sub-events as events rather than as a table of their own.
 */

'use server';

import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';

import { checkIns, events } from '@/db/schema';
import {
  adminEventCacheTag,
  eventApplicationsCacheTag,
} from '@/lib/admin-event';
import { EVENTS_CACHE_TAG, eventUrlSegments } from '@/lib/events';
import { requirePermission } from '@/lib/rbac/authorization';
import { subeventsCacheTag } from '@/lib/subevents';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { writeAuditLog } from '@/utils/audit-log';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';

import { createSubeventSchema, type CreateSubeventInput } from './schemas';

async function getAuthorizedUser() {
  const user = await getUser();
  if (!user) return null;
  await requirePermission(user.id, 'event:manage');
  return user;
}

/** Everything a sub-event's write has to invalidate, all keyed on the parent. */
async function revalidateSubevents(parentEventId: string) {
  updateTag(subeventsCacheTag(parentEventId));
  // The parent's own listing entries and overview tiles.
  updateTag(EVENTS_CACHE_TAG);
  updateTag(adminEventCacheTag(parentEventId));
  updateTag(eventApplicationsCacheTag(parentEventId));

  for (const segment of await eventUrlSegments(parentEventId)) {
    revalidatePath(`/dashboard/admin/events/${segment}`);
    revalidatePath(`/dashboard/admin/events/${segment}/subevents`);
    revalidatePath(`/dashboard/events/${segment}`);
  }
}

/**
 * Adds a sub-event to a main event.
 * Requires event:manage permission.
 */
export async function createSubevent(
  parentEventId: string,
  data: CreateSubeventInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const parsed = createSubeventSchema.safeParse(data);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  // The parent must itself be top-level. Sub-events are exactly one level
  // deep, and this is the only place that's enforced — it's what lets the
  // check-in target resolver get away with a single-hop parentage check and
  // means nothing in the codebase ever has to walk a tree of events.
  const [parent] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, parentEventId), isNull(events.parentEventId)))
    .limit(1);
  if (!parent) return fail('Event not found.');

  // Every participation-shaped flag is pinned off rather than left to its
  // column default, so a sub-event can never drift into an application, RSVP,
  // team or wallet-pass surface. `isFeatured` especially: that index is
  // sitewide, so a featured sub-event would steal the public register link.
  const [created] = await db
    .insert(events)
    .values({
      parentEventId,
      name: parsed.data.name,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
      location: parsed.data.location || null,
      slug: null,
      hasApplication: false,
      applicationQuestions: [],
      teamsEnabled: false,
      isFeatured: false,
      capacityVisible: false,
    })
    .returning({ id: events.id });

  await revalidateSubevents(parentEventId);

  await writeAuditLog({
    actorId: user.id,
    action: 'event.subevent.created',
    targetType: 'event',
    targetId: created.id,
    metadata: { parentEventId, name: parsed.data.name },
  });

  return ok({ id: created.id });
}

/**
 * Removes a sub-event, and with it the check-ins recorded against it.
 *
 * This is the only path in the codebase that deletes an `events` row, and it is
 * scoped so it can only ever reach a child: the `parent_event_id = parentEventId`
 * predicate is unsatisfiable for a top-level event, which is exactly why this
 * isn't generalised into a `deleteEvent`.
 *
 * Requires event:manage permission.
 */
export async function deleteSubevent(
  parentEventId: string,
  subeventId: string,
): Promise<ActionResult> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const [subevent] = await db
    .select({ id: events.id, name: events.name, termsId: events.termsId })
    .from(events)
    .where(
      and(eq(events.id, subeventId), eq(events.parentEventId, parentEventId)),
    )
    .limit(1);
  if (!subevent) return fail('Sub-event not found.');

  // `events.parent_event_id` is ON DELETE SET NULL, so a child of this row
  // would be silently promoted into a top-level event. `createSubevent`'s
  // depth guard makes that unreachable; this is the belt to its braces.
  const [grandchild] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.parentEventId, subeventId))
    .limit(1);
  if (grandchild) {
    return fail('That sub-event has sub-events of its own. Remove them first.');
  }

  const checkInRows = await db
    .select({ userId: checkIns.userId })
    .from(checkIns)
    .where(eq(checkIns.eventId, subeventId));

  await db.transaction(async (tx) => {
    // `events.terms_id -> event_terms.id` has no ON DELETE while
    // `event_terms.event_id -> events.id` cascades, so the two tables
    // reference each other. Dropping the pointer first keeps the delete from
    // depending on which side Postgres happens to resolve first.
    if (subevent.termsId) {
      await tx
        .update(events)
        .set({ termsId: null })
        .where(eq(events.id, subeventId));
    }
    // Re-asserting the parentage inside the transaction, not just in the read
    // above: this is the predicate that makes deleting a main event impossible.
    await tx
      .delete(events)
      .where(
        and(
          eq(events.id, subeventId),
          isNotNull(events.parentEventId),
          eq(events.parentEventId, parentEventId),
        ),
      );
  });

  await revalidateSubevents(parentEventId);

  await writeAuditLog({
    actorId: user.id,
    action: 'event.subevent.deleted',
    targetType: 'event',
    targetId: subeventId,
    // The check-in count goes in the log because the rows themselves are gone
    // on cascade — without it a mis-delete leaves no trace of what it cost.
    metadata: {
      parentEventId,
      name: subevent.name,
      checkInsRemoved: checkInRows.length,
    },
  });

  return ok();
}
