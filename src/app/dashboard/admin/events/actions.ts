'use server';

import { randomUUID } from 'crypto';
import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/utils/db';
import { eventTypeExists } from '@/lib/event-types';
import { invalidateEvent } from '@/lib/event-cache';
import * as schema from '@/db/schema';
import { getUser } from '@/utils/auth';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import * as Rbac from '@/lib/rbac/server';
import * as Rsvp from '@/lib/rsvp/server';
import { isSummarizableQuestion, type ApplicationQuestion } from '@/types/application';
import type { ParticipationStatus } from '@/types/lookups';
import * as Participation from '@/lib/participation/server';
import {
  addQuestionSchema,
  editQuestionSchema,
  createEventSchema,
  updateEventSettingsSchema,
  updateParticipantStatusSchema,
  submissionsCloseAtError,
} from './schemas';
import type {
  AddQuestionInput,
  EditQuestionInput,
  CreateEventInput,
  UpdateEventSettingsInput,
  UpdateParticipantStatusInput,
} from './schemas';
import { validateQuestionEdit } from '@/lib/question-diff';
import { writeAuditLog } from '@/utils/audit-log';

// ── Internal helpers ──────────────────────────────────────────────────────

async function getAuthorizedUser() {
  const user = await getUser();
  if (!user) return null;
  await Rbac.requirePermission(user.id, 'event:manage');
  return user;
}

/** Fetch all current questions for an event (null if not found). */
async function fetchQuestions(eventId: string): Promise<ApplicationQuestion[] | null> {
  const [row] = await db
    .select({ applicationQuestions: schema.events.applicationQuestions })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);

  if (!row) return null;
  return (row.applicationQuestions as ApplicationQuestion[] | null) ?? [];
}

/** Fetch all event_participants.responses for a given event. */
async function fetchAllResponses(eventId: string): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select({ responses: schema.eventParticipants.responses })
    .from(schema.eventParticipants)
    .where(eq(schema.eventParticipants.eventId, eventId));
  return rows.map((r) => (r.responses as Record<string, unknown>) ?? {});
}

/** Write updated questions back. */
async function writeQuestions(eventId: string, questions: ApplicationQuestion[]): Promise<void> {
  await db
    .update(schema.events)
    .set({ applicationQuestions: questions, updatedAt: new Date() })
    .where(eq(schema.events.id, eventId));

  // Single funnel for every question mutation (add/edit/remove/reorder/
  // reactivate), so the event dashboard's cached question list and stats
  // can't drift behind an edit no matter which action made it.
  await invalidateEvent(eventId, 'questions');
}

// ── Public actions ────────────────────────────────────────────────────────

export type EventWithQuestions = {
  id: string;
  name: string;
  hasApplication: boolean;
  questions: ApplicationQuestion[];
  hasApplications: boolean;
};

/**
 * Fetches an event with its application questions and whether any applications exist.
 * Requires event:manage permission.
 */
export async function getEventWithQuestions(eventId: string): Promise<ActionResult<EventWithQuestions>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requirePermission(user.id, 'event:manage');

  const [eventRow] = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1);

  if (!eventRow) return fail('Event not found');

  // Fetch applications count - ensure we're getting a fresh count
  const applicationsData = await db
    .select({ total: count() })
    .from(schema.eventParticipants)
    .where(eq(schema.eventParticipants.eventId, eventId));

  const applicationCount = applicationsData[0]?.total ?? 0;

  const questions = await fetchQuestions(eventId);

  return ok({
    id: eventRow.id,
    name: eventRow.name,
    hasApplication: eventRow.hasApplication,
    questions: questions ?? [],
    hasApplications: applicationCount > 0,
  });
}

/**
 * Adds a new question to an event's application_questions.
 * Requires event:manage permission.
 * Returns the created question with backend-generated UUIDs.
 */
export async function addQuestion(eventId: string, data: AddQuestionInput): Promise<ActionResult<ApplicationQuestion>> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const parsed = addQuestionSchema.safeParse(data);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const input = parsed.data;
  const questions = await fetchQuestions(eventId);
  if (!questions) return fail('Event not found');

  const maxOrder = questions.reduce((m, q) => Math.max(m, q.order), 0);
  const needsOptions = input.type === 'single_select' || input.type === 'multi_select';

  const newQuestion: ApplicationQuestion = {
    id: randomUUID(),
    label: input.label,
    description: input.description,
    type: input.type,
    required: input.required,
    maxLength: input.maxLength ?? undefined,
    showInApplicationReview: input.showInApplicationReview,
    showInReports: isSummarizableQuestion(input.type) ? input.showInReports : undefined,
    order: maxOrder + 1,
    active: true,
    options: needsOptions
      ? (input.options ?? []).map((o) => ({
          value: randomUUID(),
          label: o.label,
          active: true,
        }))
      : undefined,
  };

  await writeQuestions(eventId, [...questions, newQuestion]);

  await writeAuditLog({
    actorId: user.id,
    action: 'event.question.added',
    targetType: 'event',
    targetId: eventId,
    metadata: { questionId: newQuestion.id },
  });
  return ok(newQuestion);
}

/**
 * Edits an existing question. Enforces type immutability and option-removal rules
 * when applications exist.
 * Requires event:manage permission.
 */
export async function editQuestion(
  eventId: string,
  questionId: string,
  data: EditQuestionInput,
): Promise<ActionResult> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const parsed = editQuestionSchema.safeParse(data);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const questions = await fetchQuestions(eventId);
  if (!questions) return fail('Event not found');

  const idx = questions.findIndex((q) => q.id === questionId);
  if (idx === -1) return fail('Question not found');

  const existing = questions[idx]!;
  const allResponses = await fetchAllResponses(eventId);

  const result = validateQuestionEdit(existing, parsed.data, allResponses);
  if (!result.ok) return fail(result.error);

  const updated = questions.map((q, i) => (i === idx ? result.question : q));
  await writeQuestions(eventId, updated);

  await writeAuditLog({
    actorId: user.id,
    action: 'event.question.updated',
    targetType: 'event',
    targetId: eventId,
    metadata: { questionId },
  });
  return ok('Question updated.');
}

/**
 * Removes a question. Hard-deletes if no applications exist; soft-deletes (active=false) otherwise.
 * Section dividers are always hard-deleted (they don't store any data).
 * Requires event:manage permission.
 */
export async function removeQuestion(eventId: string, questionId: string): Promise<ActionResult> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const questions = await fetchQuestions(eventId);
  if (!questions) return fail('Event not found');

  const questionToDelete = questions.find((q) => q.id === questionId);
  if (!questionToDelete) return fail('Question not found');

  const allResponses = await fetchAllResponses(eventId);
  const hasApplications = allResponses.length > 0;

  // Section dividers can always be hard-deleted (they don't store responses)
  const isSectionDivider = questionToDelete.type === 'section_divider';
  const shouldHardDelete = !hasApplications || isSectionDivider;

  let updated: ApplicationQuestion[];

  if (shouldHardDelete) {
    updated = questions.filter((q) => q.id !== questionId);
  } else {
    updated = questions.map((q) => (q.id === questionId ? { ...q, active: false } : q));
  }

  await writeQuestions(eventId, updated);

  await writeAuditLog({
    actorId: user.id,
    action: shouldHardDelete ? 'event.question.deleted' : 'event.question.hidden',
    targetType: 'event',
    targetId: eventId,
    metadata: { questionId },
  });
  return ok(shouldHardDelete ? 'Question deleted.' : 'Question hidden (applications exist).');
}

/**
 * Reorders questions by providing the desired order of question IDs.
 * All existing question IDs must be present.
 * Requires event:manage permission.
 */
export async function reorderQuestions(eventId: string, orderedIds: string[]): Promise<ActionResult> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const questions = await fetchQuestions(eventId);
  if (!questions) return fail('Event not found');

  const byId = new Map(questions.map((q) => [q.id, q]));

  if (orderedIds.length !== byId.size || !orderedIds.every((id) => byId.has(id))) {
    return fail('orderedIds must contain exactly all existing question IDs');
  }

  const reordered = orderedIds.map((id, i) => ({
    ...byId.get(id)!,
    order: i + 1,
  }));
  await writeQuestions(eventId, reordered);

  await writeAuditLog({
    actorId: user.id,
    action: 'event.questions.reordered',
    targetType: 'event',
    targetId: eventId,
    metadata: { orderedIds },
  });
  return ok('Questions reordered.');
}

/**
 * Reactivates a hidden question (sets active=true).
 * Requires event:manage permission.
 */
export async function reactivateQuestion(eventId: string, questionId: string): Promise<ActionResult> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const questions = await fetchQuestions(eventId);
  if (!questions) return fail('Event not found');

  const idx = questions.findIndex((q) => q.id === questionId);
  if (idx === -1) return fail('Question not found');

  const updated = questions.map((q, i) => (i === idx ? { ...q, active: true } : q));
  await writeQuestions(eventId, updated);

  await writeAuditLog({
    actorId: user.id,
    action: 'event.question.reactivated',
    targetType: 'event',
    targetId: eventId,
    metadata: { questionId },
  });
  return ok('Question reactivated.');
}

// ── Event management ──────────────────────────────────────────────────────

/**
 * Whether `slug` is free. Format and reserved-word rules are already enforced
 * by the zod schema; this is the uniqueness half, checked up front so a taken
 * slug comes back as a message the form can render next to the field instead
 * of a unique-violation from `idx_events_slug_unique`.
 */
async function isEventSlugAvailable(slug: string, exceptEventId?: string): Promise<boolean> {
  const [taken] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(
      exceptEventId
        ? and(eq(schema.events.slug, slug), ne(schema.events.id, exceptEventId))
        : eq(schema.events.slug, slug),
    )
    .limit(1);

  return !taken;
}

/**
 * Creates a new event.
 * Requires event:manage permission.
 */
export async function createEvent(data: CreateEventInput): Promise<ActionResult<{ id: string }>> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const parsed = createEventSchema.safeParse(data);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const input = parsed.data;

  // Empty string is the form's "no slug"; both it and an omitted field mean
  // the event stays addressable by its uuid alone.
  const slug = input.slug?.trim() || null;
  if (slug && !(await isEventSlugAvailable(slug))) {
    return fail('That URL slug is already used by another event.');
  }

  const [newEvent] = await db
    .insert(schema.events)
    .values({
      id: randomUUID(),
      name: input.name,
      slug,
      hasApplication: input.hasApplication,
      capacity: input.capacity ?? null,
      capacityVisible: input.capacityVisible ?? false,
      rsvpResponseWindowHours: input.rsvpResponseWindowHours ?? Rsvp.DEFAULT_RSVP_RESPONSE_WINDOW_HOURS,
      teamsEnabled: input.teamsEnabled ?? false,
      maxTeamSize: input.maxTeamSize ?? null,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      checkInEnabled: input.checkInEnabled ?? true,
      location: input.location || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      radiusMeters: input.radiusMeters ?? null,
      // Keep question configuration independent from the application-process
      // toggle. Events may require an application with no custom questions.
      applicationQuestions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: schema.events.id });

  await invalidateEvent(newEvent.id, 'settings');

  await writeAuditLog({
    actorId: user.id,
    action: 'event.created',
    targetType: 'event',
    targetId: newEvent.id,
  });
  return ok({ id: newEvent.id });
}

/**
 * Updates event settings.
 * Requires event:manage permission.
 */
export async function updateEventSettings(eventId: string, data: UpdateEventSettingsInput): Promise<ActionResult> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const parsed = updateEventSettingsSchema.safeParse(data);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const [eventRow] = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1);

  if (!eventRow) return fail('Event not found');

  const input = parsed.data;

  // The schema's start-before-end refine only fires when a single request
  // supplies both fields. A partial update (e.g. startsAt alone) has to be
  // checked again here against whichever value — new or already-stored —
  // each field will actually end up with, or a lone edit can push
  // startsAt past the untouched stored endsAt.
  const finalStartsAt =
    input.startsAt !== undefined ? (input.startsAt ? new Date(input.startsAt) : null) : eventRow.startsAt;
  const finalEndsAt = input.endsAt !== undefined ? (input.endsAt ? new Date(input.endsAt) : null) : eventRow.endsAt;

  if (finalStartsAt && finalEndsAt && finalStartsAt >= finalEndsAt) {
    return fail('Start date must be before end date');
  }

  const finalSubmissionsCloseAt =
    input.submissionsCloseAt !== undefined
      ? input.submissionsCloseAt
        ? new Date(input.submissionsCloseAt)
        : null
      : eventRow.submissionsCloseAt;
  const deadlineError = submissionsCloseAtError({
    startsAt: finalStartsAt,
    endsAt: finalEndsAt,
    submissionsCloseAt: finalSubmissionsCloseAt,
  });
  if (deadlineError) return fail(deadlineError);

  // Teams own submissions, check-in decides who may work on them, and the
  // deadline is what freezes them. Once any team has started a project,
  // switching one of those off would strand it, so refuse instead.
  const turnsOffTeams = input.teamsEnabled === false && eventRow.teamsEnabled;
  const turnsOffCheckIn = input.checkInEnabled === false && eventRow.checkInEnabled;
  const clearsDeadline = finalSubmissionsCloseAt == null && eventRow.submissionsCloseAt != null;
  if (turnsOffTeams || turnsOffCheckIn || clearsDeadline) {
    const [existingSubmission] = await db
      .select({ id: schema.submissions.id })
      .from(schema.submissions)
      .where(eq(schema.submissions.eventId, eventId))
      .limit(1);
    if (existingSubmission) {
      const what = turnsOffTeams
        ? 'turn off teams'
        : turnsOffCheckIn
          ? 'turn off check-in'
          : 'remove the submission deadline';
      return fail(`Teams have already started project submissions, so you can't ${what}.`);
    }
  }

  // A sub-event is edited through this same form, and most of the settings that
  // make no sense for one are harmless if set. Featured is the exception:
  // idx_events_featured_unique is sitewide, so featuring a sub-event would
  // quietly steal the public site's register link and the /welcome onboarding
  // event from the real event it belongs to.
  if (input.isFeatured === true && eventRow.parentEventId) {
    return fail('A schedule entry cannot be the featured event.');
  }

  if (input.eventTypeId != null && !(await eventTypeExists(input.eventTypeId))) {
    return fail('Unknown schedule entry type.');
  }

  // undefined leaves the stored slug alone; '' or null clears it back to
  // uuid-only addressing.
  const finalSlug = input.slug !== undefined ? input.slug?.trim() || null : eventRow.slug;

  if (finalSlug && finalSlug !== eventRow.slug && !(await isEventSlugAvailable(finalSlug, eventId))) {
    return fail('That URL slug is already used by another event.');
  }

  const latitude = input.latitude !== undefined ? input.latitude : eventRow.latitude;
  const longitude = input.longitude !== undefined ? input.longitude : eventRow.longitude;
  const radiusMeters = input.radiusMeters !== undefined ? input.radiusMeters : eventRow.radiusMeters;

  // latitude/longitude/radiusMeters must all be set or all unset. The Zod
  // schema can't enforce this for a partial update (a payload touching only
  // one field doesn't know the other two's current DB values), so re-check
  // against the merged (existing + incoming) result before writing.
  const geofenceValues = [latitude, longitude, radiusMeters];
  const geofenceCount = geofenceValues.filter((v) => v != null).length;
  if (geofenceCount !== 0 && geofenceCount !== 3) {
    return fail('Latitude, longitude, and radius must all be set together for the pass geofence');
  }

  await db.transaction(async (tx) => {
    // Only one event may be featured at a time (enforced by idx_events_featured_unique).
    if (input.isFeatured === true) {
      await tx
        .update(schema.events)
        .set({ isFeatured: false })
        .where(and(eq(schema.events.isFeatured, true), ne(schema.events.id, eventId)));
    }

    await tx
      .update(schema.events)
      .set({
        name: input.name ?? eventRow.name,
        slug: finalSlug,
        descriptionMarkdown:
          input.descriptionMarkdown !== undefined
            ? input.descriptionMarkdown.trim() || null
            : eventRow.descriptionMarkdown,
        hasApplication: input.hasApplication ?? eventRow.hasApplication,
        capacity: input.capacity !== undefined ? input.capacity : eventRow.capacity,
        capacityVisible: input.capacityVisible ?? eventRow.capacityVisible,
        rsvpResponseWindowHours: input.rsvpResponseWindowHours ?? eventRow.rsvpResponseWindowHours,
        teamsEnabled: input.teamsEnabled ?? eventRow.teamsEnabled,
        checkInEnabled: input.checkInEnabled ?? eventRow.checkInEnabled,
        maxTeamSize: input.maxTeamSize !== undefined ? input.maxTeamSize : eventRow.maxTeamSize,
        startsAt: finalStartsAt,
        endsAt: finalEndsAt,
        submissionsCloseAt: finalSubmissionsCloseAt,
        location: input.location !== undefined ? input.location || null : eventRow.location,
        latitude,
        longitude,
        radiusMeters,
        isFeatured: input.isFeatured ?? eventRow.isFeatured,
        eventTypeId: input.eventTypeId !== undefined ? input.eventTypeId : eventRow.eventTypeId,
        updatedAt: new Date(),
      })
      .where(eq(schema.events.id, eventId));
  });

  // A rename leaves the old slug's pages cached too.
  await invalidateEvent(eventId, 'settings', { previousSlug: eventRow.slug });

  await writeAuditLog({
    actorId: user.id,
    action: 'event.updated',
    targetType: 'event',
    targetId: eventId,
    metadata: { fields: Object.keys(input) },
  });
  return ok('Event updated.');
}

class StatusChangeError extends Error {}

/**
 * Admin: set a participant to any status from the applications table.
 *
 * Any status can be reached from any other; which permissions a move needs is
 * `adminTransitionPermissions` in `@/lib/participation/transitions`. The
 * participant row is locked and the move is checked against its current
 * status inside one transaction, so a wave going out (or the participant
 * answering) concurrently can't slip between them.
 *
 * Side effects keep the invitation in step with the status:
 * - To `invited` without an invitation, or with one in a closed wave: invited
 *   in the open RSVP wave (refused when no wave is open) and their invitation
 *   email is queued.
 * - To a review status (pending_review / waitlisted / denied): any invitation
 *   is withdrawn, so a later wave can invite them afresh.
 * - To `accepted`: an override — skips the capacity check and records no
 *   Event Terms consent the participant never gave.
 * Moving off `accepted` is refused once they've checked in.
 */
export async function updateParticipantStatus(
  input: UpdateParticipantStatusInput,
): Promise<ActionResult<{ status: ParticipationStatus }>> {
  const authUser = await getUser();
  if (!authUser) return fail('Not authenticated');

  await Rbac.requireAnyPermission(authUser.id, ['application:review:all', 'rsvp:write:all']);

  const parsed = updateParticipantStatusSchema.safeParse(input);
  if (!parsed.success) return fail('Invalid status.');
  const { eventId, participantId, status } = parsed.data;

  let result: {
    userId: string;
    from: ParticipationStatus;
    newInvitationId: string | null;
  };
  try {
    result = await db.transaction(async (tx) => {
      if (status === 'invited') {
        // Same lock order as `sendRsvpWave` and `submitRsvpResponse` (event,
        // then participant), so the open wave can't close underneath us.
        await tx
          .select({ id: schema.events.id })
          .from(schema.events)
          .where(eq(schema.events.id, eventId))
          .for('update');
      }

      const [row] = await tx
        .select({
          userId: schema.eventParticipants.userId,
          statusLabel: schema.participationStatuses.label,
          invitationId: schema.eventInvitations.id,
          respondBy: schema.eventRsvpWaves.respondBy,
        })
        .from(schema.eventParticipants)
        .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
        .leftJoin(schema.eventInvitations, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
        .leftJoin(schema.eventRsvpWaves, eq(schema.eventInvitations.rsvpWaveId, schema.eventRsvpWaves.id))
        .where(and(eq(schema.eventParticipants.id, participantId), eq(schema.eventParticipants.eventId, eventId)))
        .for('update', { of: schema.eventParticipants })
        .limit(1);
      if (!row) throw new StatusChangeError('Application not found.');

      const now = new Date();
      const from = Participation.resolveEffectiveStatus(row.statusLabel, row.respondBy, now);
      if (from === status) {
        return { userId: row.userId, from, newInvitationId: null };
      }

      const required = Participation.adminTransitionPermissions(from, status) ?? [];
      for (const permission of required) {
        if (!(await Rbac.hasPermission(authUser.id, permission))) {
          throw new StatusChangeError('You do not have permission to make this change.');
        }
      }

      if (Participation.isAttending(from)) {
        const [checkIn] = await tx
          .select({ userId: schema.checkIns.userId })
          .from(schema.checkIns)
          .where(and(eq(schema.checkIns.eventId, eventId), eq(schema.checkIns.userId, row.userId)))
          .limit(1);
        if (checkIn) {
          throw new StatusChangeError(
            'This applicant has already checked in, so their status can no longer be changed.',
          );
        }
      }

      let newInvitationId: string | null = null;
      const needsOpenWave =
        status === 'invited' && (!row.invitationId || (row.respondBy !== null && row.respondBy <= now));
      if (needsOpenWave) {
        const [openWave] = await tx
          .select({
            id: schema.eventRsvpWaves.id,
            respondBy: schema.eventRsvpWaves.respondBy,
          })
          .from(schema.eventRsvpWaves)
          .where(eq(schema.eventRsvpWaves.eventId, eventId))
          .orderBy(desc(schema.eventRsvpWaves.wave))
          .limit(1);
        if (!openWave || openWave.respondBy <= now) {
          throw new StatusChangeError(
            "There's no open RSVP wave to invite them in. Send the next wave from the RSVP page instead.",
          );
        }
        if (row.invitationId) {
          // Their wave has closed: re-invite them in the open one instead.
          await tx
            .update(schema.eventInvitations)
            .set({
              rsvpWaveId: openWave.id,
              respondedAt: null,
              acceptedTermsId: null,
              termsAcceptedAt: null,
              invitationEmailStatus: 'unsent',
              invitationEmailAttempts: 0,
              invitationEmailLastError: null,
              invitationEmailQueuedAt: null,
              invitationEmailSentAt: null,
            })
            .where(eq(schema.eventInvitations.id, row.invitationId));
          newInvitationId = row.invitationId;
        } else {
          const [invitation] = await tx
            .insert(schema.eventInvitations)
            .values({ rsvpWaveId: openWave.id, participantId })
            .returning({ id: schema.eventInvitations.id });
          newInvitationId = invitation.id;
        }
      }

      const toReview = Participation.isReviewStatus(status);
      await tx
        .update(schema.eventParticipants)
        .set({
          statusId: Participation.statusIdOf(status),
          ...(toReview ? { reviewedAt: now, reviewedBy: authUser.id } : {}),
        })
        .where(eq(schema.eventParticipants.id, participantId));

      if (row.invitationId && toReview) {
        // Back in review: the invitation is withdrawn, so a later wave can
        // invite them again (one invitation per participant).
        await tx.delete(schema.eventInvitations).where(eq(schema.eventInvitations.id, row.invitationId));
      } else if (row.invitationId && !newInvitationId) {
        const decided = status === 'accepted' || status === 'declined';
        await tx
          .update(schema.eventInvitations)
          .set({ respondedAt: decided ? now : null })
          .where(eq(schema.eventInvitations.id, row.invitationId));
      }

      return { userId: row.userId, from, newInvitationId };
    });
  } catch (error) {
    if (error instanceof StatusChangeError) return fail(error.message);
    console.error('[admin/events] failed to change participant status', error);
    return fail('Failed to update status.');
  }

  if (result.from === status) return ok({ status });

  // A review decision moves the vote tally's inputs — "Denied" drops a
  // member out of their team's score, and anyone leaving review frees or
  // joins the waitlist — so re-rank. Best effort: the status change itself
  // has committed, and the next vote resyncs anyway.
  try {
    await Rsvp.syncWaitlistForEvent(eventId, authUser.id);
  } catch (error) {
    console.error('[admin/events] Waitlist sync after status change failed:', error);
  }

  await invalidateEvent(eventId, 'participation');

  if (result.newInvitationId) {
    // Best effort, like a wave: an invitation left `unsent` is picked up by
    // the requeue sweep.
    try {
      await Rsvp.publishRsvpInvitation(result.newInvitationId);
      await db
        .update(schema.eventInvitations)
        .set({
          invitationEmailStatus: 'queued',
          invitationEmailQueuedAt: new Date(),
        })
        .where(
          and(
            eq(schema.eventInvitations.id, result.newInvitationId),
            eq(schema.eventInvitations.invitationEmailStatus, 'unsent'),
          ),
        );
    } catch (error) {
      console.error('[admin/events] failed to queue RSVP invitation', error);
    }
  }

  await writeAuditLog({
    actorId: authUser.id,
    action: 'event.participant_status_changed',
    targetType: 'event_participant',
    targetId: participantId,
    metadata: { eventId, userId: result.userId, from: result.from, to: status },
  });

  return ok({ status });
}

export type SendEventRsvpWaveResult = {
  waveNumber: number;
  /** The open wave this send closed early, if any. */
  closedWave: { wave: number; timedOutCount: number } | null;
  eligibleApplicantCount: number;
  responsesCreated: number;
  invitationsQueued: number;
  queueFailures: Array<{
    userId: string;
    email: string;
    error: string;
  }>;
};

/**
 * Read-only RSVP wave/capacity summary for admin RSVP surfaces.
 * Requires rsvp:read:all, the permission the RSVP page is gated on.
 */
export async function getEventRsvpSummary(eventId: string): Promise<ActionResult<Rsvp.AdminRsvpSummary>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requirePermission(user.id, 'rsvp:read:all');

  if (!eventId.trim()) return fail('Event ID is required.');

  const summary = await Rsvp.getAdminRsvpSummary(eventId);
  if (!summary) return fail('Event not found');

  return ok(summary);
}

export type {
  AdminRsvpLifecycle,
  AdminRsvpParticipant,
  AdminRsvpSummary,
  AdminRsvpWaveSummary,
  InvitationEmailStatus as RsvpInvitationEmailStatus,
} from '@/lib/rsvp';

/**
 * Admin: resend the RSVP invitation email for one pending applicant.
 * Requires event:manage permission (satisfied by event:manage:all).
 * Sends directly (not via the queue) — this is a one-off, admin-initiated
 * retry, not a wave-scale fan-out.
 */
export async function resendRsvpInvitation(eventId: string, userId: string): Promise<ActionResult<{ email: string }>> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  if (!eventId.trim()) return fail('Event ID is required.');
  if (!userId.trim()) return fail('User ID is required.');

  const result = await Rsvp.resendRsvpMagicLink({ eventId, userId });
  if (!result.success) {
    return fail(result.error);
  }

  await invalidateEvent(eventId, 'participation');

  await writeAuditLog({
    actorId: user.id,
    action: 'event.rsvp_invitation_resent',
    targetType: 'event',
    targetId: eventId,
    metadata: { userId, responseId: result.responseId },
  });

  return ok({ email: result.email });
}

/**
 * Admin: start the next RSVP wave for an event.
 * Requires event:manage permission (satisfied by event:manage:all).
 * Deadline is `now + events.rsvp_response_window_hours`.
 *
 * `closeActiveWave` sends while a wave is still open: that wave closes now
 * and its unanswered invitations time out. That overrides people's RSVPs, so
 * it also needs `rsvp:write:all`.
 */
export async function sendEventRsvpWave(
  eventId: string,
  options: { closeActiveWave?: boolean } = {},
): Promise<ActionResult<SendEventRsvpWaveResult>> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  if (!eventId.trim()) return fail('Event ID is required.');

  const closeActiveWave = options.closeActiveWave === true;
  if (closeActiveWave && !(await Rbac.hasPermission(user.id, 'rsvp:write:all'))) {
    return fail("You don't have permission to close an open RSVP wave.");
  }

  const result = await Rsvp.sendRsvpWave(eventId, { closeActiveWave });
  if (!result.success) {
    return fail(result.error);
  }

  await invalidateEvent(eventId, 'participation');

  await writeAuditLog({
    actorId: user.id,
    action: 'event.rsvp_wave_sent',
    targetType: 'event',
    targetId: eventId,
    metadata: {
      waveNumber: result.wave.wave,
      eligibleApplicantCount: result.eligibleApplicantCount,
      responsesCreated: result.responsesCreated,
      invitationsQueued: result.invitationsQueued,
      queueFailureCount: result.queueFailures.length,
      closedWave: result.closedWave,
    },
  });

  return ok({
    waveNumber: result.wave.wave,
    closedWave: result.closedWave,
    eligibleApplicantCount: result.eligibleApplicantCount,
    responsesCreated: result.responsesCreated,
    invitationsQueued: result.invitationsQueued,
    queueFailures: result.queueFailures,
  });
}

/**
 * Admin: the event's waitlist in queue order — the order RSVP waves invite
 * in. Requires rsvp:read:all, like the rest of the RSVP page.
 */
export async function getEventWaitlist(eventId: string): Promise<ActionResult<Rsvp.WaitlistEntry[]>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await Rbac.requirePermission(user.id, 'rsvp:read:all');
  if (!eventId.trim()) return fail('Event ID is required.');
  return ok(await Rsvp.getWaitlist(eventId));
}

export type { WaitlistEntry } from '@/lib/rsvp';

type FormedTeamMember = {
  userId: string;
  name: string;
  email: string;
  isOrganizer: boolean;
  checkedIn: boolean;
};

export type FormedTeamRow = {
  teamId: string;
  organizerId: string | null;
  organizerName: string;
  organizerEmail: string;
  memberCount: number;
  members: FormedTeamMember[];
};

/**
 * Lists all "formed" teams (more than one member) for an event, with their
 * full roster. Solo teams-of-one are excluded.
 * Requires team:read:all permission.
 */
export async function getFormedTeamsForEvent(eventId: string): Promise<ActionResult<FormedTeamRow[]>> {
  const authUser = await getUser();
  if (!authUser) return fail('Not authenticated');
  await Rbac.requirePermission(authUser.id, 'team:read:all');

  try {
    return await listFormedTeams(eventId);
  } catch (error) {
    console.error('[admin/events] failed to load teams', error);
    return fail('Failed to load teams.');
  }
}

/**
 * True when the caller may use the moderation override in `removeMember`.
 * The Teams tab is readable with `team:read:all` alone, so its remove
 * controls have to be gated on the permission that actually backs them.
 */
export async function canModerateTeams(): Promise<boolean> {
  const authUser = await getUser();
  if (!authUser) return false;
  return Rbac.hasPermission(authUser.id, 'team:manage:all');
}

async function listFormedTeams(eventId: string): Promise<ActionResult<FormedTeamRow[]>> {
  const formedTeams = await db
    .select({ teamId: schema.teamMembers.teamId, memberCount: count() })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.eventId, eventId))
    .groupBy(schema.teamMembers.teamId)
    .having(sql`count(*) > 1`);

  if (formedTeams.length === 0) return ok([]);

  const teamIds = formedTeams.map((t) => t.teamId);
  const countByTeamId = new Map(formedTeams.map((t) => [t.teamId, t.memberCount]));

  const [teamRows, memberRows, checkInRows] = await Promise.all([
    db
      .select({ id: schema.teams.id, organizerId: schema.teams.organizerId })
      .from(schema.teams)
      .where(inArray(schema.teams.id, teamIds)),
    db
      .select({
        teamId: schema.teamMembers.teamId,
        userId: schema.teamMembers.userId,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.teamMembers)
      .innerJoin(schema.user, eq(schema.teamMembers.userId, schema.user.id))
      .where(inArray(schema.teamMembers.teamId, teamIds)),
    db
      .select({ userId: schema.checkIns.userId })
      .from(schema.checkIns)
      .innerJoin(schema.teamMembers, eq(schema.teamMembers.userId, schema.checkIns.userId))
      .where(and(eq(schema.checkIns.eventId, eventId), inArray(schema.teamMembers.teamId, teamIds))),
  ]);

  const checkedInUserIds = new Set(checkInRows.map((r) => r.userId));
  const membersByTeamId = new Map<string, FormedTeamMember[]>();
  for (const row of memberRows) {
    const list = membersByTeamId.get(row.teamId) ?? [];
    list.push({
      userId: row.userId,
      name: row.name,
      email: row.email,
      isOrganizer: false,
      checkedIn: checkedInUserIds.has(row.userId),
    });
    membersByTeamId.set(row.teamId, list);
  }

  return ok(
    teamRows.map((t) => {
      const members = (membersByTeamId.get(t.id) ?? []).map((m) => ({
        ...m,
        isOrganizer: m.userId === t.organizerId,
      }));
      const organizer = members.find((m) => m.isOrganizer);
      return {
        teamId: t.id,
        organizerId: t.organizerId,
        organizerName: organizer?.name ?? 'Unknown',
        organizerEmail: organizer?.email ?? '',
        memberCount: countByTeamId.get(t.id) ?? members.length,
        members,
      };
    }),
  );
}
