/**
 * Server actions for participant registration
 * 
 * This module contains server actions and data fetching functions for
 * the hackathon registration system. All functions run on the server
 * and enforce authentication requirements.
 */

"use server";

import {
  participantDietaryRestrictions,
  participantInterests,
  participants,
  genders,
  universities,
  majors,
  yearsOfStudy,
  interests,
  dietaryRestrictions,
  heardFromSources,
} from "@/db/schema";
import { getUser } from "@/utils/auth";
import { ActionResult, fail, ok } from "@/utils/action-result";
import { db } from "@/utils/db";
import {
  formSchema,
  type RegistrationFormValues,
} from "@/components/registration-form/schema";
import { unstable_cache } from "next/cache";

/**
 * Registers a new participant for the hackathon
 * 
 * This function:
 * 1. Validates user authentication
 * 2. Validates form data against the registration schema
 * 3. Inserts participant data in a database transaction
 * 4. Associates selected interests and dietary restrictions
 * 
 * @param formData - The registration form data to process
 * @returns ActionResult indicating success with a message or failure with an error
 * 
 * @example
 * ```tsx
 * const result = await registerParticipant(formData);
 * if (result.success) {
 *   console.log('Registration successful');
 * } else {
 *   console.error('Registration failed:', result.error);
 * }
 * ```
 */
export async function registerParticipant(
  formData: RegistrationFormValues,
): Promise<ActionResult> {
  const user = await getUser();

  if (!user) return fail("User not authenticated");

  // Validate form data against schema
  const parsed = formSchema.safeParse(formData);

  if (!parsed.success) {
    const message = parsed.error.message;
    return fail(`Validation failed: ${message}`);
  }

  const data = parsed.data;

  try {
    // Use transaction to ensure all inserts succeed or all fail
    await db.transaction(async (tx) => {
      // Insert main participant record
      await tx.insert(participants).values({
        userId: user.id,
        fullName: data.fullName,
        attendedBefore: data.attendedBefore,
        genderId: data.genderId,
        universityId: data.universityId,
        majorId: data.majorId,
        yearOfStudyId: data.yearOfStudyId,
        accommodations: data.accommodations ?? null,
        needsParking: data.needsParking,
        heardFromId: data.heardFromId,
        consentInfoUse: data.consentInfoUse,
        consentSponsorShare: data.consentSponsorShare,
        consentMediaUse: data.consentMediaUse,
      });

      // Insert participant interests (many-to-many relationship)
      if (data.interests?.length) {
        await tx.insert(participantInterests).values(
          data.interests.map((interestId) => ({
            userId: user.id,
            interestId,
          })),
        );
      }

      // Insert dietary restrictions (many-to-many relationship)
      if (data.dietaryRestrictions?.length) {
        await tx.insert(participantDietaryRestrictions).values(
          data.dietaryRestrictions.map((restrictionId) => ({
            userId: user.id,
            restrictionId,
          })),
        );
      }
    });

    return ok("Participant registered successfully.");
  } catch (error) {
    console.error("Registration error:", error);
    return fail("Failed to register participant.");
  }
}

/**
 * Internal function to fetch all registration form options from the database
 * 
 * This function queries all lookup tables in parallel and transforms them
 * into a format suitable for form select inputs.
 * 
 * @returns Object containing all form options (genders, universities, etc.)
 */
async function _getOptions() {
  // Fetch all lookup tables in parallel for efficiency
  const [
    genderRows,
    universityRows,
    majorRows,
    yearRows,
    interestRows,
    dietaryRows,
    heardFromRows,
  ] = await Promise.all([
    db.select().from(genders),
    db.select().from(universities),
    db.select().from(majors),
    db.select().from(yearsOfStudy),
    db.select().from(interests),
    db.select().from(dietaryRestrictions),
    db.select().from(heardFromSources),
  ]);

  // Transform database rows into { value, label } format for form selects
  return {
    genders: genderRows.map((g) => ({ value: g.id, label: g.label })),
    universities: universityRows.map((u) => ({ value: u.id, label: u.label })),
    majors: majorRows.map((m) => ({ value: m.id, label: m.label })),
    years: yearRows.map((y) => ({ value: y.id, label: y.label })),
    interests: interestRows.map((i) => ({ value: i.id, label: i.label })),
    dietary: dietaryRows.map((d) => ({ value: d.id, label: d.label })),
    heardFrom: heardFromRows.map((h) => ({ value: h.id, label: h.label })),
  };
}

/**
 * Fetches all registration form options with caching
 * 
 * This function retrieves all dropdown options for the registration form.
 * Results are cached for 24 hours (86400 seconds) to reduce database load,
 * as lookup data rarely changes.
 * 
 * @returns Promise resolving to an object with all form options
 * 
 * @example
 * ```tsx
 * const options = await getOptions();
 * // options.genders = [{ value: 1, label: "Male" }, ...]
 * // options.universities = [{ value: 1, label: "University A" }, ...]
 * ```
 */
export const getOptions = unstable_cache(
  _getOptions,
  ["registration-options"],
  {
    revalidate: 86400, // Cache for 24 hours (in seconds)
  },
);
