/**
 * Server actions for event application flow and event listing.
 * Application = form for events with has_application; no "registration" in success messages.
 */

'use server';

import {
  events,
  userProfiles,
  userInterests,
  userDietaryRestrictions,
  eventApplications,
  applicationStatuses,
  eventAttendees,
  eventInterestRegistrations,
  applicationFormView,
  genders,
  universities,
  majors,
  yearsOfStudy,
  interests,
  dietaryRestrictions,
} from '@/db/schema';
import { getUser } from '@/utils/auth';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { db } from '@/utils/db';
import {
  profileFormSchema,
  type ProfileFormValues,
} from '@/components/profile-form/schema';
import {
  eventOnlySchema,
  type EventOnlyFormValues,
} from '@/components/application-form/schema';
import type { ApplicationQuestion } from '@/types/application';
import { cacheLife, revalidatePath } from 'next/cache';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { getUserProfile } from '@/app/dashboard/profile/actions';
import { buildApplicationResponses } from './application-responses';
import {
  type ApplicationStatusLabel,
  type ApplicationStatusDisplay,
  getApplicationStatusDisplay,
  getApplicationStatusDisplayMap,
  resolveApplicationStatusKey,
} from './application-status';

/**
 * Returns the first event with has_application = true (e.g. default hackathon).
 * Used for redirecting /register to /dashboard/events and for ticket default event.
 */
async function getDefaultApplicationEvent() {
  'use cache';
  cacheLife('minutes');
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
async function registerParticipant(
  profileData: ProfileFormValues,
  eventData: EventOnlyFormValues,
  eventId: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

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

  const built = buildApplicationResponses(
    applicationQuestions,
    event.applicationResponses,
  );
  if (!built.ok) return fail(built.error);
  const responses = built.responses;

  const [pendingReview] = await db
    .select({ id: applicationStatuses.id })
    .from(applicationStatuses)
    .where(eq(applicationStatuses.label, 'pending_review'))
    .limit(1);
  if (!pendingReview) {
    return fail('Application statuses are not configured.');
  }

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
          statusId: pendingReview.id,
        })
        .onConflictDoUpdate({
          target: [eventApplications.eventId, eventApplications.userId],
          set: {
            responses,
            updatedAt: new Date(),
          },
        });
    });

    return ok('Application saved successfully.');
  } catch (error) {
    console.error('Application save error:', error);
    return fail('Failed to save event application.');
  }
}

/**
 * Fetches all application form options with caching
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
  if (!user) return fail('Could not get user');

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

  if (data.length === 0) return fail('No existing record found');

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
  if (!user) return fail('User not authenticated');

  const profileResult = await getUserProfile();
  if (!profileResult.success)
    return fail(profileResult.error ?? 'Could not load profile');
  const profile = profileResult.data;
  if (profile == null)
    return fail('Complete your profile first before applying to events.');

  return registerParticipant(profile, eventData, eventId);
}

export type ApplicationStatusForUser = {
  applicationId: string;
  statusKey: ApplicationStatusLabel;
  statusDisplay: ApplicationStatusDisplay;
  reviewedAt: Date | null;
  waitlistPosition: number | null;
  createdAt: Date;
};

/**
 * Current user's application row for an event + review status label.
 * Returns null if there is no application row for (user, event).
 */
export async function getUserApplicationStatus(
  eventId: string,
): Promise<ApplicationStatusForUser | null> {
  const user = await getUser();
  if (!user) return null;
  const [row] = await db
    .select({
      applicationId: eventApplications.id,
      statusKey: applicationStatuses.label,
      reviewedAt: eventApplications.reviewedAt,
      waitlistPosition: eventApplications.waitlistPosition,
      createdAt: eventApplications.createdAt,
    })
    .from(eventApplications)
    .leftJoin(
      applicationStatuses,
      eq(eventApplications.statusId, applicationStatuses.id),
    )
    .where(
      and(
        eq(eventApplications.userId, user.id),
        eq(eventApplications.eventId, eventId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const statusKey = resolveApplicationStatusKey(row.statusKey);
  return {
    ...row,
    statusKey,
    statusDisplay: await getApplicationStatusDisplay(statusKey),
  };
}

/**
 * Records interest for an event for the current user.
 * Requires authentication and a completed profile.
 */
export async function registerEventInterest(
  eventId: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const profileResult = await getUserProfile();
  if (!profileResult.success)
    return fail(profileResult.error ?? 'Could not load profile');
  if (profileResult.data == null)
    return fail(
      'Complete your profile first before getting reminders for events.',
    );

  try {
    await db
      .insert(eventInterestRegistrations)
      .values({ userId: user.id, eventId })
      .onConflictDoNothing({
        target: [
          eventInterestRegistrations.userId,
          eventInterestRegistrations.eventId,
        ],
      });

    revalidatePath('/dashboard/events');
    return ok('Event interest saved successfully.');
  } catch (error) {
    console.error('Event interest save error:', error);
    return fail('Failed to save event interest.');
  }
}

export type EventWithUserStatus = {
  id: string;
  name: string;
  hasApplication: boolean;
  userHasRegisteredInterest: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  userStatus: 'applied' | 'registered' | null;
  statusKey: ApplicationStatusLabel | null;
  statusDisplay: ApplicationStatusDisplay | null;
  waitlistPosition: number | null;
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
    .select({
      id: events.id,
      name: events.name,
      hasApplication: events.hasApplication,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      userHasRegisteredInterest: isNotNull(eventInterestRegistrations.userId),
    })
    .from(events)
    .leftJoin(
      eventInterestRegistrations,
      and(
        eq(eventInterestRegistrations.eventId, events.id),
        eq(eventInterestRegistrations.userId, user.id),
      ),
    )
    .orderBy(desc(events.createdAt));

  const [applicationRows, attendeeEventIds] = await Promise.all([
    db
      .select({
        eventId: eventApplications.eventId,
        statusKey: applicationStatuses.label,
        waitlistPosition: eventApplications.waitlistPosition,
      })
      .from(eventApplications)
      .leftJoin(
        applicationStatuses,
        eq(eventApplications.statusId, applicationStatuses.id),
      )
      .where(eq(eventApplications.userId, user.id)),
    db
      .select({ eventId: eventAttendees.eventId })
      .from(eventAttendees)
      .where(eq(eventAttendees.userId, user.id)),
  ]);

  const registeredSet = new Set(attendeeEventIds.map((r) => r.eventId));
  const statusByEventId = new Map(
    applicationRows.map((r) => [r.eventId, r] as const),
  );
  const displayMap = await getApplicationStatusDisplayMap();

  return allEvents.map((e) => {
    const application = statusByEventId.get(e.id);
    const statusKey = application
      ? resolveApplicationStatusKey(application.statusKey)
      : null;
    return {
      id: e.id,
      name: e.name,
      hasApplication: e.hasApplication,
      userHasRegisteredInterest: Boolean(e.userHasRegisteredInterest),
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      userStatus: e.hasApplication
        ? statusByEventId.has(e.id)
          ? ('applied' as const)
          : null
        : registeredSet.has(e.id)
          ? ('registered' as const)
          : null,
      statusKey,
      statusDisplay: statusKey ? displayMap[statusKey] : null,
      waitlistPosition: application?.waitlistPosition ?? null,
    };
  });
}
