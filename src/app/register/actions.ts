/**
 * Server actions for simple event signup (register/unregister for events without application).
 * For events with application, use dashboard/events/actions.ts.
 */

'use server';

import { getUserProfile } from '@/app/dashboard/profile/actions';
import {
  REGISTER_EMAIL_NOT_VERIFIED_MESSAGE,
  REGISTER_NEEDS_PROFILE_MESSAGE,
} from '@/app/register/messages';
import { eventAttendees } from '@/db/schema';
import { getUser } from '@/utils/auth';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { db } from '@/utils/db';
import { and, eq } from 'drizzle-orm';

export {
  REGISTER_EMAIL_NOT_VERIFIED_MESSAGE,
  REGISTER_NEEDS_PROFILE_MESSAGE,
} from '@/app/register/messages';

type VerifiedWithProfileGate =
  | { ok: true; userId: string }
  | { ok: false; result: ActionResult };

async function requireVerifiedUserWithProfile(): Promise<VerifiedWithProfileGate> {
  const user = await getUser();
  if (!user) return { ok: false, result: fail('User not authenticated') };
  if (!user.emailVerified) {
    return { ok: false, result: fail(REGISTER_EMAIL_NOT_VERIFIED_MESSAGE) };
  }

  const profileResult = await getUserProfile();
  if (!profileResult.success) {
    return {
      ok: false,
      result: fail(profileResult.error ?? 'Could not load profile'),
    };
  }
  if (profileResult.data == null) {
    return { ok: false, result: fail(REGISTER_NEEDS_PROFILE_MESSAGE) };
  }

  return { ok: true, userId: user.id };
}

/**
 * Registers the current user for an event that has no application (simple signup).
 */
export async function registerForEvent(eventId: string): Promise<ActionResult> {
  const gate = await requireVerifiedUserWithProfile();
  if (!gate.ok) return gate.result;

  try {
    await db
      .insert(eventAttendees)
      .values({
        eventId,
        userId: gate.userId,
      })
      .onConflictDoNothing({
        target: [eventAttendees.eventId, eventAttendees.userId],
      });
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
  const gate = await requireVerifiedUserWithProfile();
  if (!gate.ok) return gate.result;

  try {
    await db
      .delete(eventAttendees)
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.userId, gate.userId),
        ),
      );
    return ok('Unregistered from event.');
  } catch (error) {
    console.error('Unregister from event error:', error);
    return fail('Failed to unregister from event.');
  }
}
