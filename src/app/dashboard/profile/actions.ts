/**
 * Server actions for user profile (dashboard profile page).
 * Profile-only: user_profiles, user_interests, user_dietary_restrictions.
 * Decoupled from event registration (see register/actions.ts).
 */

"use server";

import {
  userProfiles,
  userInterests,
  userDietaryRestrictions,
} from "@/db/schema";
import { getUser } from "@/utils/auth";
import { db } from "@/utils/db";
import { eq } from "drizzle-orm";
import { ActionResult, fail, ok } from "@/utils/action-result";
import {
  profileFormSchema,
  type ProfileFormValues,
} from "@/components/registration-form/schema";

export type UserProfileData = {
  fullName: string;
  genderId: number;
  universityId: number;
  majorId: number;
  yearOfStudyId: number;
  interests: number[];
  dietaryRestrictions: number[];
};

/**
 * Returns the current user's profile (user_profiles + user_interests + user_dietary_restrictions).
 * No attendedBefore; used for ProfileForm initial and event-form pre-fill when no prior application.
 * Returns ok(null) when no profile row exists.
 */
export async function getUserProfile(): Promise<
  ActionResult<UserProfileData | null>
> {
  const user = await getUser();
  if (!user) return fail("User not authenticated");

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1);

  if (!profile) return ok(null);

  const [interestRows, restrictionRows] = await Promise.all([
    db
      .select({ interestId: userInterests.interestId })
      .from(userInterests)
      .where(eq(userInterests.userId, user.id)),
    db
      .select({ restrictionId: userDietaryRestrictions.restrictionId })
      .from(userDietaryRestrictions)
      .where(eq(userDietaryRestrictions.userId, user.id)),
  ]);

  return ok({
    fullName: profile.fullName,
    genderId: profile.genderId,
    universityId: profile.universityId,
    majorId: profile.majorId,
    yearOfStudyId: profile.yearOfStudyId,
    interests: interestRows.map((r) => r.interestId),
    dietaryRestrictions: restrictionRows.map((r) => r.restrictionId),
  });
}

/**
 * Saves user profile only (user_profiles, user_interests, user_dietary_restrictions).
 * Does not touch event_applications. Accommodations stay event-only.
 */
export async function saveUserProfile(
  formData: ProfileFormValues,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail("User not authenticated");

  const parsed = profileFormSchema.safeParse(formData);
  if (!parsed.success) {
    return fail(`Validation failed: ${parsed.error.message}`);
  }

  const data = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(userProfiles)
        .values({
          userId: user.id,
          fullName: data.fullName,
          genderId: data.genderId,
          universityId: data.universityId,
          majorId: data.majorId,
          yearOfStudyId: data.yearOfStudyId,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            fullName: data.fullName,
            genderId: data.genderId,
            universityId: data.universityId,
            majorId: data.majorId,
            yearOfStudyId: data.yearOfStudyId,
            updatedAt: new Date(),
          },
        });

      await tx.delete(userInterests).where(eq(userInterests.userId, user.id));
      if (data.interests?.length) {
        await tx.insert(userInterests).values(
          data.interests.map((interestId) => ({
            userId: user.id,
            interestId,
          })),
        );
      }

      await tx
        .delete(userDietaryRestrictions)
        .where(eq(userDietaryRestrictions.userId, user.id));
      if (data.dietaryRestrictions?.length) {
        await tx.insert(userDietaryRestrictions).values(
          data.dietaryRestrictions.map((restrictionId) => ({
            userId: user.id,
            restrictionId,
          })),
        );
      }
    });

    return ok("Profile saved successfully.");
  } catch (error) {
    console.error("Profile save error:", error);
    return fail("Failed to save profile.");
  }
}
