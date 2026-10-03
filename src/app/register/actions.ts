/**
 * Server actions for simple event signup (register/unregister for events without application).
 * The public `/register` route (page.tsx in this directory) redirects to the
 * featured event and does not use these actions directly.
 */

'use server';

import { events, eventParticipants } from '@/db/schema';
import { getUser } from '@/utils/auth';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { db } from '@/utils/db';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';
import { eventApplicationsCacheTag } from '@/lib/admin-event';
import { hasEventElapsed } from '@/lib/events';
import { hasStatus, statusIdOf } from '@/lib/participation/server';

/**
 * The event's end instant and whether it takes applications, or `undefined`
 * when there's no such event to register for.
 *
 * Deliberately scoped to top-level events: a sub-event (a meal, a workshop) has
 * no signup of its own — attendance is recorded by checking in, using the
 * parent event's pass. No UI offers it, but these actions take a bare id, so
 * reading a child as "not found" is what keeps a participant row from ever
 * being written against one.
 */
async function getRegistrableEvent(
  eventId: string,
): Promise<{ endsAt: Date | null; hasApplication: boolean } | undefined> {
  const [row] = await db
    .select({ endsAt: events.endsAt, hasApplication: events.hasApplication })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.parentEventId)))
    .limit(1);
  return row;
}

/**
 * Registers the current user for an event that has no application (simple signup).
 */
export async function registerForEvent(eventId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const event = await getRegistrableEvent(eventId);
  if (!event) return fail('Event not found.');
  // Registering goes straight to `accepted` — an event that takes
  // applications must go through review instead.
  if (event.hasApplication) {
    return fail('This event requires an application.');
  }
  if (hasEventElapsed(event.endsAt)) {
    return fail('This event has already ended.');
  }

  try {
    await db
      .insert(eventParticipants)
      .values({
        eventId,
        userId: user.id,
        statusId: statusIdOf('accepted'),
      })
      .onConflictDoNothing({
        target: [eventParticipants.eventId, eventParticipants.userId],
      });
    revalidatePath('/dashboard/events');
    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/events/${eventId}`);
    revalidatePath('/welcome', 'layout');
    updateTag(eventApplicationsCacheTag(eventId));
    return ok('Registered for event.');
  } catch (error) {
    console.error('Register for event error:', error);
    return fail('Failed to register for event.');
  }
}

/**
 * Form action wrapper for registerForEvent (used by dashboard/events page).
 */
export async function registerForEventFormAction(
  formData: FormData,
): Promise<ActionResult> {
  const eventId = formData.get('eventId');
  if (typeof eventId !== 'string') return fail('Missing event ID');
  return registerForEvent(eventId);
}

/**
 * Unregisters the current user from an event that has no application (simple
 * signup) by removing their participant row. An event with an application
 * keeps its row — see `withdrawParticipation`.
 */
export async function unregisterFromEvent(
  eventId: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const event = await getRegistrableEvent(eventId);
  if (!event) return fail('Event not found.');
  if (event.hasApplication) {
    return fail('This event requires an application.');
  }
  if (hasEventElapsed(event.endsAt)) {
    return fail('This event has already ended. You can no longer unregister.');
  }

  try {
    await db
      .delete(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.userId, user.id),
          hasStatus('accepted'),
        ),
      );
    revalidatePath('/dashboard/events');
    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/events/${eventId}`);
    updateTag(eventApplicationsCacheTag(eventId));
    return ok('Unregistered from event.');
  } catch (error) {
    console.error('Unregister from event error:', error);
    return fail('Failed to unregister from event.');
  }
}
