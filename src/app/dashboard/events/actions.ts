/**
 * Server actions for event application flow and event listing.
 * Application = form for events with has_application; no "registration" in success messages.
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
  profileFormSchema,
  type ProfileFormValues,
} from "@/components/profile-form/schema";
import {
  eventOnlySchema,
  type EventOnlyFormValues,
} from "@/components/application-form/schema";
import type { ApplicationQuestion } from "@/types/application";
import { cacheLife } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getUserProfile } from "@/app/dashboard/profile/actions";

/**
 * Returns the first event with has_application = true (e.g. default hackathon).
 * Used for redirecting /register to /dashboard/events and for ticket default event.
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
 * Saves profile and event application for an event that has_application.
 * 1. Upserts user_profiles (from profileData)
 * 2. Replaces user_interests and user_dietary_restrictions (from profileData)
 * 3. Upserts event_applications for (eventId, userId) with responses from eventData
 */
export async function registerParticipant(
  profileData: ProfileFormValues,
  eventData: EventOnlyFormValues,
  eventId: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail("User not authenticated");

  const profileParsed = profileFormSchema.safeParse(profileData);
  if (!profileParsed.success) {
    return fail(`Profile validation failed: ${profileParsed.error.message}`);
  }
  const profile = profileParsed.data;

  const eventParsed = eventOnlySchema.safeParse(eventData);
  if (!eventParsed.success) {
    return fail(`Event validation failed: ${eventParsed.error.message}`);
  }
  const event = eventParsed.data;

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
    let value: unknown = event.applicationResponses?.[key];
    if (key === "attended_before" && value === undefined) {
      value = event.attendedBefore;
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
  responses.accommodations = event.accommodations ?? null;

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(userProfiles)
        .values({
          userId: user.id,
          fullName: profile.fullName,
          genderId: profile.genderId,
          universityId: profile.universityId,
          majorId: profile.majorId,
          yearOfStudyId: profile.yearOfStudyId,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            fullName: profile.fullName,
            genderId: profile.genderId,
            universityId: profile.universityId,
            majorId: profile.majorId,
            yearOfStudyId: profile.yearOfStudyId,
            updatedAt: new Date(),
          },
        });

      await tx.delete(userInterests).where(eq(userInterests.userId, user.id));
      if (profile.interests?.length) {
        await tx.insert(userInterests).values(
          profile.interests.map((interestId) => ({
            userId: user.id,
            interestId,
          })),
        );
      }

      await tx
        .delete(userDietaryRestrictions)
        .where(eq(userDietaryRestrictions.userId, user.id));
      if (profile.dietaryRestrictions?.length) {
        await tx.insert(userDietaryRestrictions).values(
          profile.dietaryRestrictions.map((restrictionId) => ({
            userId: user.id,
            restrictionId,
          })),
        );
      }

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

    return ok("Application saved successfully.");
  } catch (error) {
    console.error("Application save error:", error);
    return fail("Failed to save event application.");
  }
}

/**
 * Fetches all application form options with caching
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
 * Used to pre-fill the application form. Merges profile columns with responses.
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
 * Submits event application using current profile (fetched server-side) and event-only form data.
 * Use when the page composes ProfileForm and event section separately.
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

  return registerParticipant(profile, eventData, eventId);
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
