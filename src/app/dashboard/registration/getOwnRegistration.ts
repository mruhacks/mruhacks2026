/**
 * Server action for retrieving the current user's registration data
 * 
 * This module provides a function to fetch the authenticated user's
 * participant registration information from the database.
 */

import { RegistrationFormValues } from "@/components/registration-form";
import { participantFormView } from "@/db/registrations";
import { ActionResult, fail, ok } from "@/utils/action-result";
import { getUser } from "@/utils/auth";
import db from "@/utils/db";
import { eq } from "drizzle-orm";

/**
 * Retrieves the registration data for the currently authenticated user
 * 
 * This function queries the participantFormView (a database view that joins
 * participant data with their interests and dietary restrictions) to get
 * the complete registration information in a format matching the form schema.
 * 
 * @returns ActionResult containing the user's registration data or null if not found
 * 
 * @example
 * ```tsx
 * const result = await getOwnRegistration();
 * if (result.success && result.data) {
 *   // Use result.data to pre-populate the registration form
 *   console.log('User registration:', result.data);
 * } else if (result.success && !result.data) {
 *   // User hasn't registered yet
 *   console.log('No registration found');
 * } else {
 *   // Error occurred
 *   console.error('Error:', result.error);
 * }
 * ```
 */
export async function getOwnRegistration(): Promise<
  ActionResult<RegistrationFormValues | null>
> {
  const user = await getUser();
  if (!user) return fail("User not logged in");

  console.log(user.id);

  // Query the participant form view for the current user's data
  const [participants] = await db
    .select()
    .from(participantFormView)
    .where(eq(participantFormView.userId, user.id));

  console.log(participants);

  // Return the participant data or null if no registration exists
  return ok(participants ?? null);
}
