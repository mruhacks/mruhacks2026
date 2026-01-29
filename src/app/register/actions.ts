/**
 * Server actions for simple event signup (register/unregister for events without application).
 * For events with application, use dashboard/events/actions.ts.
 */

"use server";

import { eventAttendees } from "@/db/schema";
import { getUser } from "@/utils/auth";
import { ActionResult, fail, ok } from "@/utils/action-result";
import { db } from "@/utils/db";
import { and, eq } from "drizzle-orm";

/**
 * Registers the current user for an event that has no application (simple signup).
 */
export async function registerForEvent(eventId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail("User not authenticated");

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
    return ok("Registered for event.");
  } catch (error) {
    console.error("Register for event error:", error);
    return fail("Failed to register for event.");
  }
}

/**
 * Form action wrapper for registerForEvent (used by dashboard/events page).
 */
export async function registerForEventFormAction(
  formData: FormData,
): Promise<ActionResult> {
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string") return fail("Missing event ID");
  return registerForEvent(eventId);
}

/**
 * Unregisters the current user from an event that has no application (simple signup).
 * Only applies to events without application questions (event_attendees).
 */
export async function unregisterFromEvent(eventId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail("User not authenticated");

  try {
    await db
      .delete(eventAttendees)
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.userId, user.id),
        ),
      );
    return ok("Unregistered from event.");
  } catch (error) {
    console.error("Unregister from event error:", error);
    return fail("Failed to unregister from event.");
  }
}
