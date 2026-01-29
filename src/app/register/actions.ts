/**
 * Server actions for event application (registration) flow
 *
 * Event-scoped: apply to an event (has_application) or register for event (no application).
 * Profile (user_profiles, user_interests, user_dietary_restrictions) and
 * application (event_applications.responses) are updated in one transaction.
 */

"use server";

import {
  events,
  userProfiles,
  userInterests,
  userDietaryRestrictions,
  eventApplications,
  eventAttendees,
  applicationFormView,
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
import { cacheLife } from "next/cache";
import { and, eq } from "drizzle-orm";

/**
 * Returns the first event with has_application = true (e.g. default hackathon).
 * Used for redirecting /register to /register/[eventId].
 */
export async function getDefaultApplicationEvent() {
  "use cache";
  cacheLife("minutes");
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.hasApplication, true))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Registers/updates user profile and application for an event.
 * 1. Upserts user_profiles (fullName, genderId, universityId, majorId, yearOfStudyId)
 * 2. Replaces user_interests and user_dietary_restrictions
 * 3. Upserts event_applications for (eventId, userId) with responses JSONB
 */
export async function registerParticipant(
  formData: RegistrationFormValues,
  eventId: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail("User not authenticated");

  const parsed = formSchema.safeParse(formData);
  if (!parsed.success) {
    return fail(`Validation failed: ${parsed.error.message}`);
  }

  const data = parsed.data;

  // Event-specific answers go into responses (keys match default application_questions)
  const responses: Record<string, unknown> = {
    attended_before: data.attendedBefore,
    accommodations: data.accommodations ?? null,
    needs_parking: data.needsParking,
    heard_from_id: data.heardFromId,
    consent_info_use: data.consentInfoUse,
    consent_sponsor_share: data.consentSponsorShare,
    consent_media_use: data.consentMediaUse,
  };

  try {
    await db.transaction(async (tx) => {
      // Upsert user profile
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

      // Replace user interests
      await tx.delete(userInterests).where(eq(userInterests.userId, user.id));
      if (data.interests?.length) {
        await tx.insert(userInterests).values(
          data.interests.map((interestId) => ({
            userId: user.id,
            interestId,
          })),
        );
      }

      // Replace user dietary restrictions
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

      // Upsert event application (composite PK: eventId, userId)
      await tx
        .insert(eventApplications)
        .values({
          eventId,
          userId: user.id,
          responses,
        })
        .onConflictDoUpdate({
          target: [eventApplications.eventId, eventApplications.userId],
          set: {
            responses,
            updatedAt: new Date(),
          },
        });
    });

    return ok("Registration saved successfully.");
  } catch (error) {
    console.error("Registration upsert error:", error);
    return fail("Failed to save registration.");
  }
}

/**
 * Fetches all registration form options with caching
 */
export async function getOptions() {
  "use cache";
  cacheLife("hours");

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

  return Object.fromEntries(entries);
}

/**
 * Retrieves existing application + profile for the current user and event.
 * Used to pre-fill the registration form. Merges profile columns with responses.
 */
export async function getPreviousFormSubmission(eventId: string) {
  const user = await getUser();
  if (!user) return fail("Could not get user");

  const data = await db
    .select()
    .from(applicationFormView)
    .where(
      and(
        eq(applicationFormView.eventId, eventId),
        eq(applicationFormView.userId, user.id),
      ),
    )
    .limit(1);

  if (data.length === 0) return fail("No existing record found");

  const row = data[0];
  // Merge profile + responses into form shape (responses may have attended_before, accommodations, etc.)
  const responses = (row.responses ?? {}) as Record<string, unknown>;
  const initial = {
    fullName: row.fullName,
    genderId: row.genderId,
    universityId: row.universityId,
    majorId: row.majorId,
    yearOfStudyId: row.yearOfStudyId,
    interests: row.interests ?? [],
    dietaryRestrictions: row.dietaryRestrictions ?? [],
    attendedBefore: (responses.attended_before as boolean) ?? false,
    accommodations: (responses.accommodations as string) ?? undefined,
    needsParking: (responses.needs_parking as boolean) ?? false,
    heardFromId: (responses.heard_from_id as number) ?? 0,
    consentInfoUse: (responses.consent_info_use as boolean) ?? false,
    consentSponsorShare: (responses.consent_sponsor_share as boolean) ?? false,
    consentMediaUse: (responses.consent_media_use as boolean) ?? false,
  };

  return ok(initial);
}

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
