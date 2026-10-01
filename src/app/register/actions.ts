/**
 * Server actions for simple event signup (register/unregister for events without application).
 * The public `/register` route (page.tsx in this directory) redirects to the
 * featured event and does not use these actions directly.
 */

'use server';

import { events, eventAttendees } from '@/db/schema';
import { getUser } from '@/utils/auth';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { db } from '@/utils/db';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';
import { hasEventElapsed, userEventsCacheTag } from '@/lib/events';

/**
 * The event's end instant, or `undefined` when there's no such event to
 * register for.
 *
 * Deliberately scoped to top-level events: a sub-event (a meal, a workshop) has
 * no signup of its own — attendance is recorded by checking in, using the
 * parent event's pass. No UI offers it, but these actions take a bare id, so
 * reading a child as "not found" is what keeps an `event_attendees` row from
 * ever being written against one.
 */
async function getEventEndsAt(
  eventId: string,
): Promise<Date | null | undefined> {
  const [row] = await db
    .select({ endsAt: events.endsAt })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.parentEventId)))
    .limit(1);
  return row?.endsAt;
}

/**
 * Registers the current user for an event that has no application (simple signup).
 */
export async function registerForEvent(eventId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const endsAt = await getEventEndsAt(eventId);
  if (endsAt === undefined) return fail('Event not found.');
  if (hasEventElapsed(endsAt)) {
    return fail('This event has already ended.');
  }

  try {
    await db
      .insert(eventAttendees)
      .values({
        eventId,
        userId: user.id,
      })
      .onConflictDoNothing({
        target: [eventAttendees.eventId, eventAttendees.userId],
      });
    revalidatePath('/dashboard/events');
    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/events/${eventId}`);
    revalidatePath('/welcome', 'layout');
    updateTag(userEventsCacheTag(user.id));
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
 * Unregisters the current user from an event that has no application (simple signup).
 * Only applies to events without application questions (event_attendees).
 */
export async function unregisterFromEvent(
  eventId: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const endsAt = await getEventEndsAt(eventId);
  if (endsAt === undefined) return fail('Event not found.');
  if (hasEventElapsed(endsAt)) {
    return fail('This event has already ended. You can no longer unregister.');
  }

  try {
    await db
      .delete(eventAttendees)
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.userId, user.id),
        ),
      );
    revalidatePath('/dashboard/events');
    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/events/${eventId}`);
    updateTag(userEventsCacheTag(user.id));
    return ok('Unregistered from event.');
  } catch (error) {
    console.error('Unregister from event error:', error);
    return fail('Failed to unregister from event.');
  }
}
