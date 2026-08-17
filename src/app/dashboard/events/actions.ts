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
  eventRsvpWaves,
  eventRsvpResponses,
  rsvpStatuses,
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
import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import { getUserProfile } from '@/app/dashboard/profile/actions';
import { timeoutExpiredRsvpResponses } from '@/lib/rsvp/timeout-expired-rsvp-responses';
import { buildApplicationResponses } from './application-responses';
import {
  type ApplicationStatusLabel,
  type ApplicationStatusDisplay,
  getApplicationStatusDisplay,
  getApplicationStatusDisplayMap,
  resolveApplicationStatusKey,
} from './application-status';
import {
  type RsvpStatusLabel,
  type RsvpStatusDisplay,
  getRsvpStatusDisplay,
  getRsvpStatusDisplayMap,
  resolveRsvpStatusKey,
} from './rsvp-status';

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
    .select({
      hasApplication: events.hasApplication,
      applicationQuestions: events.applicationQuestions,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!eventRow) return fail('Event not found.');
  if (!eventRow.hasApplication) {
    return fail('This event does not require an application.');
  }
  const applicationQuestions =
    eventRow.applicationQuestions as ApplicationQuestion[];

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

// ---------------------------------------------------------------------------
// RSVP
// ---------------------------------------------------------------------------

export type RsvpStatusForUser = {
  responseId: string;
  statusLabel: RsvpStatusLabel;
  statusDisplay: RsvpStatusDisplay;
  respondBy: Date | null;
  respondedAt: Date | null;
};

/**
 * Current user's RSVP response for an event (latest wave).
 * Times out expired pending invites before reading so the UI stays accurate.
 * Returns null if the user has no RSVP invitation for this event.
 */
export async function getUserRsvpStatus(
  eventId: string,
): Promise<RsvpStatusForUser | null> {
  const user = await getUser();
  if (!user) return null;

  await timeoutExpiredRsvpResponses({ eventId, userId: user.id });

  const [row] = await db
    .select({
      responseId: eventRsvpResponses.id,
      statusLabel: rsvpStatuses.label,
      respondBy: eventRsvpWaves.respondBy,
      respondedAt: eventRsvpResponses.respondedAt,
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .leftJoin(rsvpStatuses, eq(eventRsvpResponses.statusId, rsvpStatuses.id))
    .where(
      and(
        eq(eventRsvpResponses.userId, user.id),
        eq(eventRsvpWaves.eventId, eventId),
      ),
    )
    .orderBy(desc(eventRsvpWaves.wave))
    .limit(1);
  if (!row) return null;
  const statusLabel = resolveRsvpStatusKey(row.statusLabel);
  return {
    ...row,
    statusLabel,
    statusDisplay: await getRsvpStatusDisplay(statusLabel),
  };
}

const EVENT_AT_CAPACITY_MESSAGE =
  'This event is at capacity. Your RSVP could not be accepted.';

class RsvpAcceptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RsvpAcceptError';
  }
}

/**
 * Accept or decline an RSVP invitation on the latest wave.
 *
 * Accept updates the RSVP row and creates an `event_attendees` record in one
 * transaction. Decline only updates the RSVP row.
 *
 * Capacity is enforced here — not at wave send — by locking the event row,
 * counting attendees, and refusing the accept when the event is already full.
 * Duplicate attendee rows are prevented by the (event_id, user_id) primary key
 * with ON CONFLICT DO NOTHING; a user who is already an attendee may still
 * accept without consuming an extra spot.
 */
export async function submitRsvpResponse(
  eventId: string,
  decision: 'accepted' | 'declined',
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  await timeoutExpiredRsvpResponses({ eventId, userId: user.id });

  const [row] = await db
    .select({
      responseId: eventRsvpResponses.id,
      statusId: eventRsvpResponses.statusId,
      statusLabel: rsvpStatuses.label,
      respondBy: eventRsvpWaves.respondBy,
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .leftJoin(rsvpStatuses, eq(eventRsvpResponses.statusId, rsvpStatuses.id))
    .where(
      and(
        eq(eventRsvpResponses.userId, user.id),
        eq(eventRsvpWaves.eventId, eventId),
      ),
    )
    .orderBy(desc(eventRsvpWaves.wave))
    .limit(1);

  if (!row) return fail('No RSVP invitation found.');
  if (row.statusId == null) return fail('RSVP statuses are not configured.');

  const currentStatus = resolveRsvpStatusKey(row.statusLabel);
  if (currentStatus === 'timed_out') {
    return fail('RSVP deadline has passed.');
  }
  if (currentStatus !== 'pending') {
    return fail('Already responded to RSVP.');
  }

  if (row.respondBy && row.respondBy < new Date()) {
    return fail('RSVP deadline has passed.');
  }

  const [decisionStatus] = await db
    .select({ id: rsvpStatuses.id })
    .from(rsvpStatuses)
    .where(eq(rsvpStatuses.label, decision))
    .limit(1);

  if (!decisionStatus) return fail('RSVP statuses are not configured.');

  const pendingResponseStatusId = row.statusId;

  try {
    await db.transaction(async (tx) => {
      if (decision === 'accepted') {
        const [eventRow] = await tx
          .select({ id: events.id, capacity: events.capacity })
          .from(events)
          .where(eq(events.id, eventId))
          .for('update')
          .limit(1);

        if (!eventRow) {
          throw new RsvpAcceptError('Event not found.');
        }

        if (eventRow.capacity !== null) {
          const [existingAttendee] = await tx
            .select({ userId: eventAttendees.userId })
            .from(eventAttendees)
            .where(
              and(
                eq(eventAttendees.eventId, eventId),
                eq(eventAttendees.userId, user.id),
              ),
            )
            .limit(1);

          if (!existingAttendee) {
            const [{ value: attendeeCount }] = await tx
              .select({ value: count() })
              .from(eventAttendees)
              .where(eq(eventAttendees.eventId, eventId));

            if (Number(attendeeCount) >= eventRow.capacity) {
              throw new RsvpAcceptError(EVENT_AT_CAPACITY_MESSAGE);
            }
          }
        }

        await tx
          .insert(eventAttendees)
          .values({
            eventId,
            userId: user.id,
          })
          .onConflictDoNothing({
            target: [eventAttendees.eventId, eventAttendees.userId],
          });
      }

      const updated = await tx
        .update(eventRsvpResponses)
        .set({
          statusId: decisionStatus.id,
          respondedAt: new Date(),
        })
        .where(
          and(
            eq(eventRsvpResponses.id, row.responseId),
            eq(eventRsvpResponses.statusId, pendingResponseStatusId),
          ),
        )
        .returning({ id: eventRsvpResponses.id });

      if (updated.length === 0) {
        throw new RsvpAcceptError('Already responded to RSVP.');
      }
    });

    revalidatePath(`/dashboard/events/${eventId}`);
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/events');
    return ok(decision === 'accepted' ? 'RSVP accepted.' : 'RSVP declined.');
  } catch (error) {
    if (error instanceof RsvpAcceptError) {
      return fail(error.message);
    }
    console.error('RSVP response error:', error);
    return fail('Failed to submit RSVP response.');
  }
}

// ---------------------------------------------------------------------------
// Event listing
// ---------------------------------------------------------------------------

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
  rsvpStatusLabel: RsvpStatusLabel | null;
  rsvpStatusDisplay: RsvpStatusDisplay | null;
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

  await timeoutExpiredRsvpResponses({ userId: user.id });

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

  const [applicationRows, attendeeEventIds, rsvpRows] = await Promise.all([
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
    db
      .select({
        eventId: eventRsvpWaves.eventId,
        statusLabel: rsvpStatuses.label,
      })
      .from(eventRsvpResponses)
      .innerJoin(
        eventRsvpWaves,
        eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
      )
      .leftJoin(rsvpStatuses, eq(eventRsvpResponses.statusId, rsvpStatuses.id))
      .where(eq(eventRsvpResponses.userId, user.id))
      .orderBy(desc(eventRsvpWaves.wave)),
  ]);

  const registeredSet = new Set(attendeeEventIds.map((r) => r.eventId));
  const statusByEventId = new Map(
    applicationRows.map((r) => [r.eventId, r] as const),
  );
  const rsvpByEventId = new Map<string, string | null>();
  for (const row of rsvpRows) {
    if (!rsvpByEventId.has(row.eventId)) {
      rsvpByEventId.set(row.eventId, row.statusLabel);
    }
  }
  const [displayMap, rsvpDisplayMap] = await Promise.all([
    getApplicationStatusDisplayMap(),
    getRsvpStatusDisplayMap(),
  ]);

  return allEvents.map((e) => {
    const application = statusByEventId.get(e.id);
    const statusKey = application
      ? resolveApplicationStatusKey(application.statusKey)
      : null;
    const rsvpLabel = rsvpByEventId.get(e.id);
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
      rsvpStatusLabel: rsvpLabel ? resolveRsvpStatusKey(rsvpLabel) : null,
      rsvpStatusDisplay: rsvpLabel
        ? rsvpDisplayMap[resolveRsvpStatusKey(rsvpLabel)]
        : null,
    };
  });
}
