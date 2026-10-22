/**
 * Server actions for event application flow and event listing.
 * Application = form for events with has_application; no "registration" in success messages.
 */

'use server';

import * as schema from '@/db/schema';
import { getUser } from '@/utils/auth';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { db } from '@/utils/db';
import { profileFormSchema, type ProfileFormValues } from '@/components/profile-form/schema';
import { eventOnlySchema, type EventOnlyFormValues } from '@/components/application-form/schema';
import type { ApplicationQuestion } from '@/types/application';
import { cacheLife, revalidatePath, updateTag } from 'next/cache';
import { eventApplicationsCacheTag } from '@/lib/admin-event';
import { and, eq } from 'drizzle-orm';
import { getUserProfile } from '../profile/actions';
import * as Rsvp from '@/lib/rsvp';
import { getAllEvents, hasEventElapsed } from '@/lib/events';
import * as Participation from '@/lib/participation/server';
import type { ParticipationStatus } from '@/types/lookups';
import * as Judging from '@/lib/judging/server';
import { buildApplicationResponses } from './application-responses';

/**
 * Saves profile and event application for an event that has_application.
 * 1. Upserts user_profiles (from profileData)
 * 2. Replaces user_dietary_restrictions (from profileData)
 * 3. Upserts event_participants for (eventId, userId) with responses from eventData
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
      hasApplication: schema.events.hasApplication,
      applicationQuestions: schema.events.applicationQuestions,
      endsAt: schema.events.endsAt,
    })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  if (!eventRow) return fail('Event not found.');
  if (!eventRow.hasApplication) {
    return fail('This event does not require an application.');
  }
  if (hasEventElapsed(eventRow.endsAt)) {
    return fail('This event has already ended. Applications are closed.');
  }
  if (await Judging.isJudgingEvent(eventId, user)) {
    return fail(Judging.JUDGE_SIGNUP_BLOCKED_MESSAGE);
  }
  const applicationQuestions = eventRow.applicationQuestions as ApplicationQuestion[];

  // Once an application has been decided (or is waitlisted), the applicant
  // can no longer change their answers — only a still-pending review may be
  // edited.
  const [existingApplication] = await db
    .select({ statusLabel: schema.participationStatuses.label })
    .from(schema.eventParticipants)
    .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
    .where(and(eq(schema.eventParticipants.eventId, eventId), eq(schema.eventParticipants.userId, user.id)))
    .limit(1);
  if (
    existingApplication &&
    !Participation.canEditApplication(Participation.resolveStoredStatus(existingApplication.statusLabel))
  ) {
    return fail('Your application has already been reviewed and can no longer be edited.');
  }

  const built = buildApplicationResponses(applicationQuestions, event.applicationResponses);
  if (!built.ok) return fail(built.error);
  const responses = built.responses;

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.userProfiles)
        .values({
          userId: user.id,
          fullName: profile.fullName,
          genderId: profile.genderId,
          genderOtherText: profile.genderOtherText || null,
          dietaryOtherText: profile.dietaryOtherText || null,
          linkedinUrl: profile.linkedinUrl || null,
        })
        .onConflictDoUpdate({
          target: schema.userProfiles.userId,
          set: {
            fullName: profile.fullName,
            genderId: profile.genderId,
            genderOtherText: profile.genderOtherText || null,
            dietaryOtherText: profile.dietaryOtherText || null,
            linkedinUrl: profile.linkedinUrl || null,
            updatedAt: new Date(),
          },
        });

      await tx
        .insert(schema.userProfileAbout)
        .values({
          userId: user.id,
          universityId: profile.universityId,
          universityOtherText: profile.universityOtherText || null,
          majorId: profile.majorId,
          majorOtherText: profile.majorOtherText || null,
          yearOfStudyId: profile.yearOfStudyId,
          githubUrl: profile.githubUrl || null,
        })
        .onConflictDoUpdate({
          target: schema.userProfileAbout.userId,
          set: {
            universityId: profile.universityId,
            universityOtherText: profile.universityOtherText || null,
            majorId: profile.majorId,
            majorOtherText: profile.majorOtherText || null,
            yearOfStudyId: profile.yearOfStudyId,
            githubUrl: profile.githubUrl || null,
            updatedAt: new Date(),
          },
        });

      await tx.delete(schema.userDietaryRestrictions).where(eq(schema.userDietaryRestrictions.userId, user.id));
      const realRestrictions = profile.dietaryRestrictions?.filter((id) => id > 0) ?? [];
      if (realRestrictions.length) {
        await tx.insert(schema.userDietaryRestrictions).values(
          realRestrictions.map((restrictionId) => ({
            userId: user.id,
            restrictionId,
          })),
        );
      }

      await tx
        .insert(schema.eventParticipants)
        .values({
          eventId,
          userId: user.id,
          responses,
          statusId: Participation.statusIdOf('pending_review'),
        })
        .onConflictDoUpdate({
          target: [schema.eventParticipants.eventId, schema.eventParticipants.userId],
          set: {
            responses,
            updatedAt: new Date(),
          },
        });
    });

    // A new/updated application moves every number on the admin event
    // dashboard — the totals tile, the status list, the over-time chart and
    // the roster all read through this tag.
    updateTag(eventApplicationsCacheTag(eventId));
    revalidatePath('/welcome', 'layout');
    return ok('Application saved successfully.');
  } catch (error) {
    console.error('[events] failed to save application', error);
    return fail('Failed to save event application.');
  }
}

async function fetchOptionsData() {
  'use cache';
  cacheLife('hours');

  const tables = {
    genders: schema.genders,
    universities: schema.universities,
    majors: schema.majors,
    years: schema.yearsOfStudy,
    dietary: schema.dietaryRestrictions,
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
 * Fetches all application form options. Requires authentication.
 * The DB query is cached separately because 'use cache' functions cannot
 * read request-scoped context like the session.
 */
export async function getOptions() {
  const u = await getUser();
  if (!u) throw new Error('Not authenticated');
  return fetchOptionsData();
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
    .from(schema.applicationFormView)
    .where(and(eq(schema.applicationFormView.eventId, eventId), eq(schema.applicationFormView.userId, user.id)))
    .limit(1);

  if (data.length === 0) return fail('No existing record found');

  const row = data[0];
  const responses = (row.responses ?? {}) as Record<string, unknown>;
  const initial = {
    fullName: row.fullName,
    genderId: row.genderId,
    genderOtherText: row.genderOtherText ?? '',
    universityId: row.universityId,
    universityOtherText: row.universityOtherText ?? '',
    majorId: row.majorId,
    majorOtherText: row.majorOtherText ?? '',
    yearOfStudyId: row.yearOfStudyId,
    linkedinUrl: row.linkedinUrl ?? '',
    githubUrl: row.githubUrl ?? '',
    dietaryRestrictions: row.dietaryRestrictions ?? [],
    dietaryOtherText: row.dietaryOtherText ?? '',
    applicationResponses: responses,
  };

  return ok(initial);
}

/**
 * Submits event application using current profile (fetched server-side) and event-only form data.
 * Use when the page composes ProfileForm and event section separately.
 */
export async function submitEventApplication(eventData: EventOnlyFormValues, eventId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const profileResult = await getUserProfile();
  if (!profileResult.success) return fail(profileResult.error ?? 'Could not load profile');
  const profile = profileResult.data;
  if (profile == null || profile.universityId == null || profile.majorId == null || profile.yearOfStudyId == null) {
    return fail('Complete your profile first before applying to events.');
  }

  return registerParticipant(
    {
      ...profile,
      universityId: profile.universityId,
      majorId: profile.majorId,
      yearOfStudyId: profile.yearOfStudyId,
    },
    eventData,
    eventId,
  );
}

// ---------------------------------------------------------------------------
// Participation status
// ---------------------------------------------------------------------------

export type ParticipationForUser = {
  participantId: string;
  /** Effective status: an expired invitation already reads as `timed_out`. */
  status: ParticipationStatus;
  display: Participation.StatusDisplay;
  createdAt: Date;
  reviewedAt: Date | null;
  /** The RSVP invitation, once one has been sent. */
  invitation: {
    respondBy: Date;
    respondedAt: Date | null;
    termsAcceptedAt: Date | null;
  } | null;
};

/**
 * The current user's participation in an event — the one status that covers
 * the application, the RSVP and attendance. Null when they have neither
 * applied nor registered.
 */
export async function getUserParticipation(eventId: string): Promise<ParticipationForUser | null> {
  const user = await getUser();
  if (!user) return null;

  const [row] = await db
    .select({
      participantId: schema.eventParticipants.id,
      statusLabel: schema.participationStatuses.label,
      createdAt: schema.eventParticipants.createdAt,
      reviewedAt: schema.eventParticipants.reviewedAt,
      respondBy: schema.eventRsvpWaves.respondBy,
      respondedAt: schema.eventInvitations.respondedAt,
      termsAcceptedAt: schema.eventInvitations.termsAcceptedAt,
    })
    .from(schema.eventParticipants)
    .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
    .leftJoin(schema.eventInvitations, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
    .leftJoin(schema.eventRsvpWaves, eq(schema.eventInvitations.rsvpWaveId, schema.eventRsvpWaves.id))
    .where(and(eq(schema.eventParticipants.userId, user.id), eq(schema.eventParticipants.eventId, eventId)))
    .limit(1);
  if (!row) return null;

  const status = Participation.resolveEffectiveStatus(row.statusLabel, row.respondBy);
  const displayMap = await Participation.getStatusDisplayMap();
  return {
    participantId: row.participantId,
    status,
    display: displayMap[status],
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    invitation: row.respondBy
      ? {
          respondBy: row.respondBy,
          respondedAt: row.respondedAt,
          termsAcceptedAt: row.termsAcceptedAt,
        }
      : null,
  };
}

class ParticipationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipationError';
  }
}

/** Revalidates every page a participant's own status change shows up on. */
function revalidateParticipation(eventId: string) {
  // Moves the admin roster, RSVP tile and capacity numbers too.
  updateTag(eventApplicationsCacheTag(eventId));
  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath('/dashboard');
}

/**
 * Accept or decline an RSVP invitation (`invited` → `accepted` / `declined`).
 *
 * Capacity is enforced here — not at wave send — by locking the event row,
 * counting `accepted` participants, and refusing the accept when the event is
 * already full. The status write is a compare-and-set from `invited`, so a
 * double submit (or a concurrent admin override) can't apply twice.
 */
export async function submitRsvpResponse(
  eventId: string,
  decision: Rsvp.RsvpUserDecision,
  consent?: { accepted: boolean; termsId: string | null },
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');
  if (!Rsvp.isRsvpUserDecision(decision)) {
    return fail('Invalid RSVP decision.');
  }

  try {
    await db.transaction(async (tx) => {
      const [eventRow] = await tx
        .select({
          capacity: schema.events.capacity,
          termsId: schema.events.termsId,
          endsAt: schema.events.endsAt,
        })
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .for('update')
        .limit(1);
      if (!eventRow) throw new ParticipationError('No RSVP invitation found.');
      if (hasEventElapsed(eventRow.endsAt)) {
        throw new ParticipationError('This event has already ended.');
      }

      const [row] = await tx
        .select({
          participantId: schema.eventParticipants.id,
          statusLabel: schema.participationStatuses.label,
          invitationId: schema.eventInvitations.id,
          respondBy: schema.eventRsvpWaves.respondBy,
        })
        .from(schema.eventParticipants)
        .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
        .innerJoin(schema.eventInvitations, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
        .innerJoin(schema.eventRsvpWaves, eq(schema.eventInvitations.rsvpWaveId, schema.eventRsvpWaves.id))
        .where(and(eq(schema.eventParticipants.eventId, eventId), eq(schema.eventParticipants.userId, user.id)))
        .for('update', { of: schema.eventParticipants })
        .limit(1);
      if (!row) throw new ParticipationError('No RSVP invitation found.');

      const current = Participation.resolveEffectiveStatus(row.statusLabel, row.respondBy);
      if (current === 'timed_out') {
        throw new ParticipationError('RSVP deadline has passed.');
      }
      if (current !== 'invited') {
        throw new ParticipationError('Already responded to RSVP.');
      }

      let acceptedTermsId: string | null = null;
      if (decision === 'accepted') {
        if (eventRow.termsId) {
          if (consent?.accepted !== true) {
            throw new ParticipationError('You must agree to the Event Terms before accepting your spot.');
          }
          if (consent.termsId !== eventRow.termsId) {
            throw new ParticipationError(
              'The Event Terms have changed. Refresh the page, review them, and agree again.',
            );
          }
          acceptedTermsId = eventRow.termsId;
        }

        if (eventRow.capacity !== null && (await Participation.countAttending(eventId, tx)) >= eventRow.capacity) {
          throw new ParticipationError(Rsvp.EVENT_AT_CAPACITY_MESSAGE);
        }
      }

      const respondedAt = new Date();
      if (respondedAt >= row.respondBy) {
        throw new ParticipationError('RSVP deadline has passed.');
      }

      const updated = await tx
        .update(schema.eventParticipants)
        .set({ statusId: Participation.statusIdOf(decision) })
        .where(
          and(
            eq(schema.eventParticipants.id, row.participantId),
            eq(schema.eventParticipants.statusId, Participation.statusIdOf('invited')),
          ),
        )
        .returning({ id: schema.eventParticipants.id });
      if (updated.length === 0) {
        throw new ParticipationError('Already responded to RSVP.');
      }

      await tx
        .update(schema.eventInvitations)
        .set({
          respondedAt,
          termsAcceptedAt: acceptedTermsId ? respondedAt : null,
          acceptedTermsId,
        })
        .where(eq(schema.eventInvitations.id, row.invitationId));
    });

    revalidateParticipation(eventId);
    return ok(decision === 'accepted' ? 'RSVP accepted.' : 'RSVP declined.');
  } catch (error) {
    if (error instanceof ParticipationError) {
      return fail(error.message);
    }
    console.error('[events] failed to submit RSVP response', error);
    return fail('Failed to submit RSVP response.');
  }
}

/**
 * Give up a confirmed spot (`accepted` → `declined`) or leave the waitlist
 * (`waitlisted` → `declined`), for an event with an application. A freed
 * spot goes to the next RSVP wave.
 *
 * Events without an application use `unregisterFromEvent` instead: their
 * signup has nothing to remember once it's withdrawn.
 */
export async function withdrawParticipation(eventId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  try {
    const wasAttending = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          participantId: schema.eventParticipants.id,
          statusId: schema.eventParticipants.statusId,
          statusLabel: schema.participationStatuses.label,
          hasApplication: schema.events.hasApplication,
          endsAt: schema.events.endsAt,
          invitationId: schema.eventInvitations.id,
          respondBy: schema.eventRsvpWaves.respondBy,
          checkedIn: schema.checkIns.userId,
        })
        .from(schema.eventParticipants)
        .innerJoin(schema.events, eq(schema.events.id, schema.eventParticipants.eventId))
        .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
        .leftJoin(schema.eventInvitations, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
        .leftJoin(schema.eventRsvpWaves, eq(schema.eventInvitations.rsvpWaveId, schema.eventRsvpWaves.id))
        .leftJoin(
          schema.checkIns,
          and(
            eq(schema.checkIns.eventId, schema.eventParticipants.eventId),
            eq(schema.checkIns.userId, schema.eventParticipants.userId),
          ),
        )
        .where(and(eq(schema.eventParticipants.eventId, eventId), eq(schema.eventParticipants.userId, user.id)))
        .for('update', { of: schema.eventParticipants })
        .limit(1);

      if (!row || !row.hasApplication) {
        throw new ParticipationError('There is nothing to withdraw from.');
      }
      const current = Participation.resolveEffectiveStatus(row.statusLabel, row.respondBy);
      // Answering an open invitation goes through `submitRsvpResponse`, which
      // owns the deadline and consent rules.
      if (current === 'invited' || !Participation.canParticipantTransition(current, 'declined')) {
        throw new ParticipationError('There is nothing to withdraw from.');
      }
      if (hasEventElapsed(row.endsAt)) {
        throw new ParticipationError('This event has already ended.');
      }
      if (row.checkedIn) {
        throw new ParticipationError("You've already checked in, so your spot can no longer be given up.");
      }

      await tx
        .update(schema.eventParticipants)
        .set({ statusId: Participation.statusIdOf('declined') })
        .where(
          and(eq(schema.eventParticipants.id, row.participantId), eq(schema.eventParticipants.statusId, row.statusId)),
        );
      if (row.invitationId) {
        await tx
          .update(schema.eventInvitations)
          .set({ respondedAt: new Date() })
          .where(eq(schema.eventInvitations.id, row.invitationId));
      }
      return current === 'accepted';
    });

    revalidateParticipation(eventId);
    return ok(wasAttending ? 'You gave up your spot.' : 'You left the waitlist.');
  } catch (error) {
    if (error instanceof ParticipationError) {
      return fail(error.message);
    }
    console.error('[events] failed to withdraw participation', error);
    return fail('Failed to update your participation.');
  }
}

// ---------------------------------------------------------------------------
// Event listing
// ---------------------------------------------------------------------------

export type EventWithUserStatus = {
  id: string;
  /** Custom URL segment, or null when the event is addressed by uuid only. */
  slug: string | null;
  name: string;
  hasApplication: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  /** Past its end instant — every participant action on it is frozen. */
  hasEnded: boolean;
  /** The user's effective participation status, or null if not involved. */
  status: ParticipationStatus | null;
  statusDisplay: Participation.StatusDisplay | null;
  /** On the event's judging roster (disabled or not). */
  isJudge: boolean;
};

/**
 * Returns all events with the current user's participation status. Used by
 * the dashboard.
 *
 * The event list (`getAllEvents`) is cached; the user's statuses are one
 * fresh query, since a status changes without the user acting (a review, an
 * RSVP wave going out, a deadline passing).
 */
export async function getEventsWithUserStatus(): Promise<EventWithUserStatus[]> {
  const user = await getUser();
  if (!user) return [];

  const [allEvents, rows, displayMap, judging] = await Promise.all([
    getAllEvents(),
    db
      .select({
        eventId: schema.eventParticipants.eventId,
        statusLabel: schema.participationStatuses.label,
        respondBy: schema.eventRsvpWaves.respondBy,
      })
      .from(schema.eventParticipants)
      .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
      .leftJoin(schema.eventInvitations, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
      .leftJoin(schema.eventRsvpWaves, eq(schema.eventInvitations.rsvpWaveId, schema.eventRsvpWaves.id))
      .where(eq(schema.eventParticipants.userId, user.id)),
    Participation.getStatusDisplayMap(),
    Judging.listJudgeEventsForUser(user),
  ]);

  const judgedEventIds = new Set(judging.map((j) => j.eventId));
  const now = new Date();
  const statusByEventId = new Map(
    rows.map((row) => [row.eventId, Participation.resolveEffectiveStatus(row.statusLabel, row.respondBy, now)]),
  );

  return allEvents.map((e) => {
    const status = statusByEventId.get(e.id) ?? null;
    return {
      id: e.id,
      slug: e.slug,
      name: e.name,
      hasApplication: e.hasApplication,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      hasEnded: hasEventElapsed(e.endsAt),
      status,
      statusDisplay: status ? displayMap[status] : null,
      isJudge: judgedEventIds.has(e.id),
    };
  });
}
