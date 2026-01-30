/**
 * Server actions for participant registration
 *
 * This module contains server actions and data fetching functions for
 * the hackathon registration system. All functions run on the server
 * and enforce authentication requirements.
 */

'use server';

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
  participantFormView,
} from '@/db/schema';
import { getUser } from '@/utils/auth';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { db } from '@/utils/db';
import {
  formSchema,
  type RegistrationFormValues,
} from '@/components/registration-form/schema';
import { cacheLife } from 'next/cache';
import { eq } from 'drizzle-orm';

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
  if (!user) return fail('User not authenticated');

  const parsed = formSchema.safeParse(formData);
  if (!parsed.success) {
    return fail(`Validation failed: ${parsed.error.message}`);
  }

  const data = parsed.data;

  try {
    await db.transaction(async (tx) => {
      // Upsert main participant record
      await tx
        .insert(participants)
        .values({
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
        })
        .onConflictDoUpdate({
          target: participants.userId,
          set: {
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
          },
        });

      // Replace participant interests (many-to-many)
      await tx
        .delete(participantInterests)
        .where(eq(participantInterests.userId, user.id));
      if (data.interests?.length) {
        await tx.insert(participantInterests).values(
          data.interests.map((interestId) => ({
            userId: user.id,
            interestId,
          })),
        );
      }

      // Replace dietary restrictions (many-to-many)
      await tx
        .delete(participantDietaryRestrictions)
        .where(eq(participantDietaryRestrictions.userId, user.id));
      if (data.dietaryRestrictions?.length) {
        await tx.insert(participantDietaryRestrictions).values(
          data.dietaryRestrictions.map((restrictionId) => ({
            userId: user.id,
            restrictionId,
          })),
        );
      }
    });

    return ok('Participant registration upserted successfully.');
  } catch (error) {
    console.error('Registration upsert error:', error);
    return fail('Failed to upsert participant registration.');
  }
}

/**
 * Fetches all registration form options with caching
 *
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
export async function getOptions() {
  'use cache';
  cacheLife('hours');

  const tables = {
    genders,
    universities,
    majors,
    years: yearsOfStudy,
    interests,
    dietary: dietaryRestrictions,
    heardFrom: heardFromSources,
  };

  const entries = await Promise.all(
    Object.entries(tables).map(async ([key, table]) => {
      const rows = await db.select().from(table);
      return [key, rows.map(({ id, label }) => ({ value: id, label }))];
    }),
  );

  const ret = Object.fromEntries(entries);

  return ret;
}

/**
 * Retrieves the registration record for the currently authenticated user.
 */
export async function getPreviousFormSubmission() {
  const user = await getUser();

  if (!user) return fail('Could not get user');

  const data = await db
    .select()
    .from(participantFormView)
    .where(eq(participantFormView.userId, user.id))
    .limit(1);

  if (data.length == 0) return fail('No existing record found');

  return ok(data[0]);
}
