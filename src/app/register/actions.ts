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
  type EventOnlyFormValues,
} from "@/components/registration-form/schema";
import type { ApplicationQuestion } from "@/types/application";
import { cacheLife } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getUserProfile } from "@/app/dashboard/profile/actions";

/**
 * Returns the first event with has_application = true (e.g. default hackathon).
 * Used for redirecting /register to /dashboard/register/[eventId].
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
 * 3. Upserts event_applications for (eventId, userId) with responses from applicationResponses (and attendedBefore when applicable)
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

  const [eventRow] = await db
    .select({ applicationQuestions: events.applicationQuestions })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  const applicationQuestions =
    (eventRow?.applicationQuestions as ApplicationQuestion[] | null) ?? [];

  const responses: Record<string, unknown> = {};
  for (const q of applicationQuestions) {
    const key = q.key;
    let value: unknown = data.applicationResponses?.[key];
    if (key === "attended_before" && value === undefined) {
      value = data.attendedBefore;
    }
    if (q.required) {
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "");
      if (empty) {
        return fail(`Required: ${q.label ?? q.key}`);
      }
    }
    responses[key] = value ?? null;
  }
  responses.accommodations = data.accommodations ?? null;

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
    applicationResponses: responses,
  };

  return ok(initial);
}

/**
 * Submits event application by merging current profile with event-only form data.
 * Use when the page composes ProfileForm and event section separately; profile is fetched server-side.
 */
export async function submitEventApplication(
  eventData: EventOnlyFormValues,
  eventId: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail("User not authenticated");

  const profileResult = await getUserProfile();
  if (!profileResult.success)
    return fail(profileResult.error ?? "Could not load profile");
  const profile = profileResult.data;
  if (profile == null)
    return fail("Complete your profile first before applying to events.");

  const merged: RegistrationFormValues = {
    ...profile,
    attendedBefore: eventData.attendedBefore,
    accommodations: eventData.accommodations,
    applicationResponses: eventData.applicationResponses ?? {},
  };
  return registerParticipant(merged, eventId);
}

export type EventWithUserStatus = {
  id: string;
  name: string;
  hasApplication: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  userStatus: "applied" | "registered" | null;
};

/**
 * Returns all events with the current user's application/attendee status.
 * Used by dashboard/events page.
 */
export async function getEventsWithUserStatus(): Promise<
  EventWithUserStatus[]
> {
  const user = await getUser();
  if (!user) return [];

  const allEvents = await db
    .select()
    .from(events)
    .orderBy(desc(events.createdAt));

  const [applicationEventIds, attendeeEventIds] = await Promise.all([
    db
      .select({ eventId: eventApplications.eventId })
      .from(eventApplications)
      .where(eq(eventApplications.userId, user.id)),
    db
      .select({ eventId: eventAttendees.eventId })
      .from(eventAttendees)
      .where(eq(eventAttendees.userId, user.id)),
  ]);

  const appliedSet = new Set(
    applicationEventIds.map((r) => r.eventId),
  );
  const registeredSet = new Set(attendeeEventIds.map((r) => r.eventId));

  return allEvents.map((e) => ({
    id: e.id,
    name: e.name,
    hasApplication: e.hasApplication,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    userStatus: e.hasApplication
      ? appliedSet.has(e.id)
        ? ("applied" as const)
        : null
      : registeredSet.has(e.id)
        ? ("registered" as const)
        : null,
  }));
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
