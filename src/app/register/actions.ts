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
import { and, count, eq } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';
import { userEventsCacheTag } from '@/lib/events';

/**
 * Registers the current user for an event that has no application (simple signup).
 */
export async function registerForEvent(eventId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  try {
    const result = await db.transaction(async (tx) => {
      // Locked for the rest of the transaction: the capacity check below is a
      // read-then-write, and without this two simultaneous registrations
      // could both read the pre-registration count and both pass, overflowing
      // capacity (same race handled for teams in joinTeamByCode).
      const [eventRow] = await tx
        .select({ capacity: events.capacity })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1)
        .for('update');
      if (!eventRow) return fail('Event not found.');

      const [existing] = await tx
        .select({ userId: eventAttendees.userId })
        .from(eventAttendees)
        .where(
          and(
            eq(eventAttendees.eventId, eventId),
            eq(eventAttendees.userId, user.id),
          ),
        )
        .limit(1);

      // Only a new registration counts against capacity; re-registering
      // (already an attendee) stays a no-op regardless of fill level.
      if (!existing && eventRow.capacity != null) {
        const [{ total }] = await tx
          .select({ total: count() })
          .from(eventAttendees)
          .where(eq(eventAttendees.eventId, eventId));
        if (total >= eventRow.capacity) {
          return fail('This event is full.');
        }
      }

      await tx
        .insert(eventAttendees)
        .values({
          eventId,
          userId: user.id,
        })
        .onConflictDoNothing({
          target: [eventAttendees.eventId, eventAttendees.userId],
        });

      return ok('Registered for event.');
    });

    if (result.success) {
      revalidatePath('/dashboard/events');
      revalidatePath('/dashboard');
      revalidatePath(`/dashboard/events/${eventId}`);
      revalidatePath('/welcome', 'layout');
      updateTag(userEventsCacheTag(user.id));
    }
    return result;
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
