'use server';

import { randomUUID } from 'crypto';
import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';
import { db } from '@/utils/db';
import { FEATURED_EVENT_CACHE_TAG } from '@/lib/featured-event';
import { subeventsCacheTag } from '@/lib/subevents';
import { EVENTS_CACHE_TAG, eventUrlSegments } from '@/lib/events';
import { eventPath } from '@/lib/event-slug';
import {
  adminEventCacheTag,
  eventApplicationsCacheTag,
} from '@/lib/admin-event';
import {
  events,
  eventParticipants,
  eventInvitations,
  participationStatuses,
  user,
  userProfiles,
  userProfileAbout,
  genders,
  universities,
  majors,
  yearsOfStudy,
  eventRsvpWaves,
  checkIns,
  teams,
  teamMembers,
} from '@/db/schema';
import { getUser } from '@/utils/auth';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import {
  hasPermission,
  requireAnyPermission,
  requirePermission,
} from '@/lib/rbac/authorization';
import { sendRsvpWave } from '@/lib/rsvp/send-rsvp-wave';
import { resendRsvpMagicLink } from '@/lib/rsvp/resend-rsvp-magic-link';
import { getAdminRsvpSummary } from '@/lib/rsvp/get-admin-rsvp-summary';
import {
  getWaitlist,
  syncWaitlistForEvent,
  type WaitlistEntry,
} from '@/lib/rsvp/waitlist';
import type { AdminRsvpSummary } from '@/lib/rsvp/get-admin-rsvp-summary';
import { DEFAULT_RSVP_RESPONSE_WINDOW_HOURS } from '@/lib/rsvp/constants';
import {
  isSummarizableQuestion,
  type ApplicationQuestion,
} from '@/types/application';
import type { ParticipationStatus } from '@/types/lookups';
import { countAttending, statusIdOf } from '@/lib/participation/server';
import {
  isAttending,
  isReviewStatus,
  resolveEffectiveStatus,
} from '@/lib/participation/status';
import { adminTransitionPermissions } from '@/lib/participation/transitions';
import { publishRsvpInvitation } from '@/lib/rsvp/rsvp-invitation-queue';
import {
  buildQuestionStats,
  buildStatusBreakdown,
  buildDemographicStats,
  type ApplicationStatsRow,
  type QuestionStats,
  type StatsBucket,
} from '@/lib/application-stats';
import {
  addQuestionSchema,
  editQuestionSchema,
  createEventSchema,
  updateEventSettingsSchema,
  updateParticipantStatusSchema,
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
  await requirePermission(user.id, 'event:manage');
  // TODO: Extend to support event-scoped permissions:
  //   - requirePermission(user.id, `event:manage:{eventId}`) for org-specific access
  //   - or check if user has role 'organizer' for this specific event
  return user;
}

/** Fetch all current questions for an event (null if not found). */
async function fetchQuestions(
  eventId: string,
): Promise<ApplicationQuestion[] | null> {
  const [row] = await db
    .select({ applicationQuestions: events.applicationQuestions })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!row) return null;
  return (row.applicationQuestions as ApplicationQuestion[] | null) ?? [];
}

/** Fetch all event_participants.responses for a given event. */
async function fetchAllResponses(
  eventId: string,
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select({ responses: eventParticipants.responses })
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, eventId));
  return rows.map((r) => (r.responses as Record<string, unknown>) ?? {});
}

/** Write updated questions back. */
async function writeQuestions(
  eventId: string,
  questions: ApplicationQuestion[],
): Promise<void> {
  await db
    .update(events)
    .set({ applicationQuestions: questions, updatedAt: new Date() })
    .where(eq(events.id, eventId));

  // Single funnel for every question mutation (add/edit/remove/reorder/
  // reactivate), so the event dashboard's cached question list and stats
  // can't drift behind an edit no matter which action made it.
  updateTag(adminEventCacheTag(eventId));
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
export async function getEventWithQuestions(
  eventId: string,
): Promise<ActionResult<EventWithQuestions>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'event:manage');

  const [eventRow] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!eventRow) return fail('Event not found');

  // Fetch applications count - ensure we're getting a fresh count
  const applicationsData = await db
    .select({ total: count() })
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, eventId));

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
export async function addQuestion(
  eventId: string,
  data: AddQuestionInput,
): Promise<ActionResult<ApplicationQuestion>> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const parsed = addQuestionSchema.safeParse(data);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const input = parsed.data;
  const questions = await fetchQuestions(eventId);
  if (!questions) return fail('Event not found');

  const maxOrder = questions.reduce((m, q) => Math.max(m, q.order), 0);
  const needsOptions =
    input.type === 'single_select' || input.type === 'multi_select';

  const newQuestion: ApplicationQuestion = {
    id: randomUUID(),
    label: input.label,
    description: input.description,
    type: input.type,
    required: input.required,
    maxLength: input.maxLength ?? undefined,
    showInApplicationReview: input.showInApplicationReview,
    showInReports: isSummarizableQuestion(input.type)
      ? input.showInReports
      : undefined,
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
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

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
export async function removeQuestion(
  eventId: string,
  questionId: string,
): Promise<ActionResult> {
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
    updated = questions.map((q) =>
      q.id === questionId ? { ...q, active: false } : q,
    );
  }

  await writeQuestions(eventId, updated);

  await writeAuditLog({
    actorId: user.id,
    action: shouldHardDelete
      ? 'event.question.deleted'
      : 'event.question.hidden',
    targetType: 'event',
    targetId: eventId,
    metadata: { questionId },
  });
  return ok(
    shouldHardDelete
      ? 'Question deleted.'
      : 'Question hidden (applications exist).',
  );
}

/**
 * Reorders questions by providing the desired order of question IDs.
 * All existing question IDs must be present.
 * Requires event:manage permission.
 */
export async function reorderQuestions(
  eventId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const questions = await fetchQuestions(eventId);
  if (!questions) return fail('Event not found');

  const byId = new Map(questions.map((q) => [q.id, q]));

  if (
    orderedIds.length !== byId.size ||
    !orderedIds.every((id) => byId.has(id))
  ) {
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
export async function reactivateQuestion(
  eventId: string,
  questionId: string,
): Promise<ActionResult> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const questions = await fetchQuestions(eventId);
  if (!questions) return fail('Event not found');

  const idx = questions.findIndex((q) => q.id === questionId);
  if (idx === -1) return fail('Question not found');

  const updated = questions.map((q, i) =>
    i === idx ? { ...q, active: true } : q,
  );
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
async function isEventSlugAvailable(
  slug: string,
  exceptEventId?: string,
): Promise<boolean> {
  const [taken] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      exceptEventId
        ? and(eq(events.slug, slug), ne(events.id, exceptEventId))
        : eq(events.slug, slug),
    )
    .limit(1);

  return !taken;
}

/**
 * Creates a new event.
 * Requires event:manage permission.
 */
export async function createEvent(
  data: CreateEventInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const parsed = createEventSchema.safeParse(data);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const input = parsed.data;

  // Empty string is the form's "no slug"; both it and an omitted field mean
  // the event stays addressable by its uuid alone.
  const slug = input.slug?.trim() || null;
  if (slug && !(await isEventSlugAvailable(slug))) {
    return fail('That URL slug is already used by another event.');
  }

  const [newEvent] = await db
    .insert(events)
    .values({
      id: randomUUID(),
      name: input.name,
      slug,
      hasApplication: input.hasApplication,
      capacity: input.capacity ?? null,
      capacityVisible: input.capacityVisible ?? false,
      rsvpResponseWindowHours:
        input.rsvpResponseWindowHours ?? DEFAULT_RSVP_RESPONSE_WINDOW_HOURS,
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
    .returning({ id: events.id });

  updateTag(EVENTS_CACHE_TAG);

  await writeAuditLog({
    actorId: user.id,
    action: 'event.created',
    targetType: 'event',
    targetId: newEvent.id,
  });
  return ok({ id: newEvent.id });
}

export type EventDetails = {
  id: string;
  slug: string | null;
  name: string;
  descriptionMarkdown: string;
  hasApplication: boolean;
  capacity: number | null;
  capacityVisible: boolean;
  rsvpResponseWindowHours: number;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  isFeatured: boolean;
  teamsEnabled: boolean;
  maxTeamSize: number | null;
  createdAt: Date;
  updatedAt: Date;
  questionsCount: number;
  applicationsCount: number;
  attendeeCount: number;
};

/**
 * Fetches full event details with stats.
 * Requires event:manage permission.
 */
export async function getEventDetails(
  eventId: string,
): Promise<ActionResult<EventDetails>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'event:manage');

  const [eventRow] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!eventRow) return fail('Event not found');

  const [{ total: applicationsCount }] = await db
    .select({ total: count() })
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, eventId));

  const attendeeCount = await countAttending(eventId);

  const questions = await fetchQuestions(eventId);
  const questionsCount = (questions ?? []).filter((q) => q.active).length;

  return ok({
    id: eventRow.id,
    slug: eventRow.slug ?? null,
    name: eventRow.name,
    descriptionMarkdown: eventRow.descriptionMarkdown ?? '',
    hasApplication: eventRow.hasApplication,
    capacity: eventRow.capacity ?? null,
    capacityVisible: eventRow.capacityVisible,
    rsvpResponseWindowHours: eventRow.rsvpResponseWindowHours,
    startsAt: eventRow.startsAt ?? null,
    endsAt: eventRow.endsAt ?? null,
    location: eventRow.location ?? null,
    latitude: eventRow.latitude ?? null,
    longitude: eventRow.longitude ?? null,
    radiusMeters: eventRow.radiusMeters ?? null,
    isFeatured: eventRow.isFeatured,
    teamsEnabled: eventRow.teamsEnabled,
    maxTeamSize: eventRow.maxTeamSize ?? null,
    createdAt: eventRow.createdAt,
    updatedAt: eventRow.updatedAt,
    questionsCount,
    applicationsCount,
    attendeeCount,
  });
}

/**
 * Updates event settings.
 * Requires event:manage permission.
 */
export async function updateEventSettings(
  eventId: string,
  data: UpdateEventSettingsInput,
): Promise<ActionResult> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  const parsed = updateEventSettingsSchema.safeParse(data);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const [eventRow] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!eventRow) return fail('Event not found');

  const input = parsed.data;

  // The schema's start-before-end refine only fires when a single request
  // supplies both fields. A partial update (e.g. startsAt alone) has to be
  // checked again here against whichever value — new or already-stored —
  // each field will actually end up with, or a lone edit can push
  // startsAt past the untouched stored endsAt.
  const finalStartsAt =
    input.startsAt !== undefined
      ? input.startsAt
        ? new Date(input.startsAt)
        : null
      : eventRow.startsAt;
  const finalEndsAt =
    input.endsAt !== undefined
      ? input.endsAt
        ? new Date(input.endsAt)
        : null
      : eventRow.endsAt;

  if (finalStartsAt && finalEndsAt && finalStartsAt >= finalEndsAt) {
    return fail('Start date must be before end date');
  }

  // A sub-event is edited through this same form, and most of the settings that
  // make no sense for one are harmless if set. Featured is the exception:
  // idx_events_featured_unique is sitewide, so featuring a sub-event would
  // quietly steal the public site's register link and the /welcome onboarding
  // event from the real event it belongs to.
  if (input.isFeatured === true && eventRow.parentEventId) {
    return fail('A schedule entry cannot be the featured event.');
  }

  // undefined leaves the stored slug alone; '' or null clears it back to
  // uuid-only addressing.
  const finalSlug =
    input.slug !== undefined ? input.slug?.trim() || null : eventRow.slug;

  if (
    finalSlug &&
    finalSlug !== eventRow.slug &&
    !(await isEventSlugAvailable(finalSlug, eventId))
  ) {
    return fail('That URL slug is already used by another event.');
  }

  const latitude =
    input.latitude !== undefined ? input.latitude : eventRow.latitude;
  const longitude =
    input.longitude !== undefined ? input.longitude : eventRow.longitude;
  const radiusMeters =
    input.radiusMeters !== undefined
      ? input.radiusMeters
      : eventRow.radiusMeters;

  // latitude/longitude/radiusMeters must all be set or all unset. The Zod
  // schema can't enforce this for a partial update (a payload touching only
  // one field doesn't know the other two's current DB values), so re-check
  // against the merged (existing + incoming) result before writing.
  const geofenceValues = [latitude, longitude, radiusMeters];
  const geofenceCount = geofenceValues.filter((v) => v != null).length;
  if (geofenceCount !== 0 && geofenceCount !== 3) {
    return fail(
      'Latitude, longitude, and radius must all be set together for the pass geofence',
    );
  }

  await db.transaction(async (tx) => {
    // Only one event may be featured at a time (enforced by idx_events_featured_unique).
    if (input.isFeatured === true) {
      await tx
        .update(events)
        .set({ isFeatured: false })
        .where(and(eq(events.isFeatured, true), ne(events.id, eventId)));
    }

    await tx
      .update(events)
      .set({
        name: input.name ?? eventRow.name,
        slug: finalSlug,
        descriptionMarkdown:
          input.descriptionMarkdown !== undefined
            ? input.descriptionMarkdown.trim() || null
            : eventRow.descriptionMarkdown,
        hasApplication: input.hasApplication ?? eventRow.hasApplication,
        capacity:
          input.capacity !== undefined ? input.capacity : eventRow.capacity,
        capacityVisible: input.capacityVisible ?? eventRow.capacityVisible,
        rsvpResponseWindowHours:
          input.rsvpResponseWindowHours ?? eventRow.rsvpResponseWindowHours,
        teamsEnabled: input.teamsEnabled ?? eventRow.teamsEnabled,
        checkInEnabled: input.checkInEnabled ?? eventRow.checkInEnabled,
        maxTeamSize:
          input.maxTeamSize !== undefined
            ? input.maxTeamSize
            : eventRow.maxTeamSize,
        startsAt: finalStartsAt,
        endsAt: finalEndsAt,
        location:
          input.location !== undefined
            ? input.location || null
            : eventRow.location,
        latitude,
        longitude,
        radiusMeters,
        isFeatured: input.isFeatured ?? eventRow.isFeatured,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));
  });

  // Homepage register-link lookup and the events list are both cached; bust
  // them so edits show up immediately.
  updateTag(FEATURED_EVENT_CACHE_TAG);
  updateTag(EVENTS_CACHE_TAG);
  updateTag(adminEventCacheTag(eventId));
  if (eventRow.parentEventId)
    updateTag(subeventsCacheTag(eventRow.parentEventId));

  // The event page is reachable by uuid and by every slug it has worn, so
  // drop the uuid path, the current slug's path, and the one a rename just
  // orphaned — otherwise a stale render survives under a URL still in use.
  for (const slug of new Set([null, finalSlug, eventRow.slug])) {
    revalidatePath(eventPath({ id: eventId, slug }));
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'event.updated',
    targetType: 'event',
    targetId: eventId,
    metadata: { fields: Object.keys(input) },
  });
  return ok('Event updated.');
}

export type ApplicationResponseRow = {
  userId: string;
  email: string;
  fullName: string;
  responses: Record<string, unknown>;
  createdAt: Date;
};

/**
 * Fetches all application responses for an event.
 * Requires event:manage permission.
 */
export async function getApplicationResponses(
  eventId: string,
): Promise<ActionResult<ApplicationResponseRow[]>> {
  const authUser = await getUser();
  if (!authUser) return fail('Not authenticated');
  await requirePermission(authUser.id, 'event:manage');

  const rows = await db
    .select({
      userId: eventParticipants.userId,
      email: user.email,
      fullName: userProfiles.fullName,
      responses: eventParticipants.responses,
      createdAt: eventParticipants.createdAt,
    })
    .from(eventParticipants)
    .innerJoin(user, eq(eventParticipants.userId, user.id))
    .leftJoin(userProfiles, eq(eventParticipants.userId, userProfiles.userId))
    .where(eq(eventParticipants.eventId, eventId))
    .orderBy(eventParticipants.createdAt);

  return ok(
    rows.map((row) => ({
      userId: row.userId,
      email: row.email,
      fullName: row.fullName || 'Unknown',
      responses: (row.responses as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
    })),
  );
}

export type EventApplicationStats = {
  hasApplication: boolean;
  total: number;
  questionStats: QuestionStats[];
  statusBreakdown: StatsBucket[];
  demographics: Record<
    'university' | 'major' | 'yearOfStudy' | 'gender',
    StatsBucket[]
  >;
};

/**
 * Aggregate application statistics for the Stats tab: per-question buckets
 * (for questions flagged `showInReports`), a status breakdown, and applicant
 * demographics.
 *
 * Aggregates on the server — raw per-applicant `responses` never crosses the
 * wire from here, which is the privacy boundary that justifies
 * `application:stats:all` being its own permission rather than a reuse of
 * `application:read:all` (that permission grants access to individual
 * applicants' answers; this one only ever grants cohort-level numbers).
 */
export async function getApplicationStats(
  eventId: string,
  status?: ParticipationStatus | 'all',
): Promise<ActionResult<EventApplicationStats>> {
  const authUser = await getUser();
  if (!authUser) return fail('Not authenticated');
  await requirePermission(authUser.id, 'application:stats');

  const [eventRow] = await db
    .select({
      applicationQuestions: events.applicationQuestions,
      hasApplication: events.hasApplication,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!eventRow) return fail('Event not found');

  const questions =
    (eventRow.applicationQuestions as ApplicationQuestion[] | null) ?? [];

  const whereClause =
    status && status !== 'all'
      ? and(
          eq(eventParticipants.eventId, eventId),
          eq(participationStatuses.label, status),
        )
      : eq(eventParticipants.eventId, eventId);

  const rows = await db
    .select({
      responses: eventParticipants.responses,
      status: participationStatuses.label,
      university: universities.label,
      major: majors.label,
      yearOfStudy: yearsOfStudy.label,
      gender: genders.label,
    })
    .from(eventParticipants)
    .leftJoin(userProfiles, eq(eventParticipants.userId, userProfiles.userId))
    .leftJoin(
      userProfileAbout,
      eq(eventParticipants.userId, userProfileAbout.userId),
    )
    .leftJoin(genders, eq(userProfiles.genderId, genders.id))
    .leftJoin(universities, eq(userProfileAbout.universityId, universities.id))
    .leftJoin(majors, eq(userProfileAbout.majorId, majors.id))
    .leftJoin(yearsOfStudy, eq(userProfileAbout.yearOfStudyId, yearsOfStudy.id))
    .innerJoin(
      participationStatuses,
      eq(eventParticipants.statusId, participationStatuses.id),
    )
    .where(whereClause);

  const statsRows: ApplicationStatsRow[] = rows.map((row) => ({
    responses: (row.responses as Record<string, unknown> | null) ?? null,
    status: row.status ?? null,
    university: row.university ?? null,
    major: row.major ?? null,
    yearOfStudy: row.yearOfStudy ?? null,
    gender: row.gender ?? null,
  }));

  return ok({
    hasApplication: eventRow.hasApplication,
    total: statsRows.length,
    questionStats: buildQuestionStats(questions, statsRows),
    statusBreakdown: buildStatusBreakdown(statsRows),
    demographics: buildDemographicStats(statsRows),
  });
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

  await requireAnyPermission(authUser.id, [
    'application:review:all',
    'rsvp:write:all',
  ]);

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
          .select({ id: events.id })
          .from(events)
          .where(eq(events.id, eventId))
          .for('update');
      }

      const [row] = await tx
        .select({
          userId: eventParticipants.userId,
          statusLabel: participationStatuses.label,
          invitationId: eventInvitations.id,
          respondBy: eventRsvpWaves.respondBy,
        })
        .from(eventParticipants)
        .innerJoin(
          participationStatuses,
          eq(eventParticipants.statusId, participationStatuses.id),
        )
        .leftJoin(
          eventInvitations,
          eq(eventInvitations.participantId, eventParticipants.id),
        )
        .leftJoin(
          eventRsvpWaves,
          eq(eventInvitations.rsvpWaveId, eventRsvpWaves.id),
        )
        .where(
          and(
            eq(eventParticipants.id, participantId),
            eq(eventParticipants.eventId, eventId),
          ),
        )
        .for('update', { of: eventParticipants })
        .limit(1);
      if (!row) throw new StatusChangeError('Application not found.');

      const now = new Date();
      const from = resolveEffectiveStatus(row.statusLabel, row.respondBy, now);
      if (from === status) {
        return { userId: row.userId, from, newInvitationId: null };
      }

      const required = adminTransitionPermissions(from, status) ?? [];
      for (const permission of required) {
        if (!(await hasPermission(authUser.id, permission))) {
          throw new StatusChangeError(
            'You do not have permission to make this change.',
          );
        }
      }

      if (isAttending(from)) {
        const [checkIn] = await tx
          .select({ userId: checkIns.userId })
          .from(checkIns)
          .where(
            and(eq(checkIns.eventId, eventId), eq(checkIns.userId, row.userId)),
          )
          .limit(1);
        if (checkIn) {
          throw new StatusChangeError(
            'This applicant has already checked in, so their status can no longer be changed.',
          );
        }
      }

      let newInvitationId: string | null = null;
      const needsOpenWave =
        status === 'invited' &&
        (!row.invitationId || (row.respondBy !== null && row.respondBy <= now));
      if (needsOpenWave) {
        const [openWave] = await tx
          .select({
            id: eventRsvpWaves.id,
            respondBy: eventRsvpWaves.respondBy,
          })
          .from(eventRsvpWaves)
          .where(eq(eventRsvpWaves.eventId, eventId))
          .orderBy(desc(eventRsvpWaves.wave))
          .limit(1);
        if (!openWave || openWave.respondBy <= now) {
          throw new StatusChangeError(
            "There's no open RSVP wave to invite them in. Send the next wave from the RSVP page instead.",
          );
        }
        if (row.invitationId) {
          // Their wave has closed: re-invite them in the open one instead.
          await tx
            .update(eventInvitations)
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
            .where(eq(eventInvitations.id, row.invitationId));
          newInvitationId = row.invitationId;
        } else {
          const [invitation] = await tx
            .insert(eventInvitations)
            .values({ rsvpWaveId: openWave.id, participantId })
            .returning({ id: eventInvitations.id });
          newInvitationId = invitation.id;
        }
      }

      const toReview = isReviewStatus(status);
      await tx
        .update(eventParticipants)
        .set({
          statusId: statusIdOf(status),
          ...(toReview ? { reviewedAt: now, reviewedBy: authUser.id } : {}),
        })
        .where(eq(eventParticipants.id, participantId));

      if (row.invitationId && toReview) {
        // Back in review: the invitation is withdrawn, so a later wave can
        // invite them again (one invitation per participant).
        await tx
          .delete(eventInvitations)
          .where(eq(eventInvitations.id, row.invitationId));
      } else if (row.invitationId && !newInvitationId) {
        const decided = status === 'accepted' || status === 'declined';
        await tx
          .update(eventInvitations)
          .set({ respondedAt: decided ? now : null })
          .where(eq(eventInvitations.id, row.invitationId));
      }

      return { userId: row.userId, from, newInvitationId };
    });
  } catch (error) {
    if (error instanceof StatusChangeError) return fail(error.message);
    console.error('Participant status change error:', error);
    return fail('Failed to update status.');
  }

  if (result.from === status) return ok({ status });

  // A review decision moves the vote tally's inputs — "Denied" drops a
  // member out of their team's score, and anyone leaving review frees or
  // joins the waitlist — so re-rank. Best effort: the status change itself
  // has committed, and the next vote resyncs anyway.
  try {
    await syncWaitlistForEvent(eventId, authUser.id);
  } catch (error) {
    console.error('Waitlist sync after status change failed:', error);
  }

  updateTag(eventApplicationsCacheTag(eventId));

  if (result.newInvitationId) {
    // Best effort, like a wave: an invitation left `unsent` is picked up by
    // the requeue sweep.
    try {
      await publishRsvpInvitation(result.newInvitationId);
      await db
        .update(eventInvitations)
        .set({
          invitationEmailStatus: 'queued',
          invitationEmailQueuedAt: new Date(),
        })
        .where(
          and(
            eq(eventInvitations.id, result.newInvitationId),
            eq(eventInvitations.invitationEmailStatus, 'unsent'),
          ),
        );
    } catch (error) {
      console.error('Failed to queue RSVP invitation:', error);
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
export async function getEventRsvpSummary(
  eventId: string,
): Promise<ActionResult<AdminRsvpSummary>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'rsvp:read:all');

  if (!eventId.trim()) return fail('Event ID is required.');

  const summary = await getAdminRsvpSummary(eventId);
  if (!summary) return fail('Event not found');

  return ok(summary);
}

export type {
  AdminRsvpLifecycle,
  AdminRsvpParticipant,
  AdminRsvpSummary,
  AdminRsvpWaveSummary,
  RsvpInvitationEmailStatus,
} from '@/lib/rsvp/get-admin-rsvp-summary';

/**
 * Admin: resend the RSVP invitation email for one pending applicant.
 * Requires event:manage permission (satisfied by event:manage:all).
 * Sends directly (not via the queue) — this is a one-off, admin-initiated
 * retry, not a wave-scale fan-out.
 */
export async function resendRsvpInvitation(
  eventId: string,
  userId: string,
): Promise<ActionResult<{ email: string }>> {
  const user = await getAuthorizedUser();
  if (!user) return fail('Not authenticated');

  if (!eventId.trim()) return fail('Event ID is required.');
  if (!userId.trim()) return fail('User ID is required.');

  const result = await resendRsvpMagicLink({ eventId, userId });
  if (!result.success) {
    return fail(result.error);
  }

  updateTag(eventApplicationsCacheTag(eventId));
  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/admin/events/${segment}`);
  }

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
  if (closeActiveWave && !(await hasPermission(user.id, 'rsvp:write:all'))) {
    return fail("You don't have permission to close an open RSVP wave.");
  }

  const result = await sendRsvpWave(eventId, { closeActiveWave });
  if (!result.success) {
    return fail(result.error);
  }

  updateTag(eventApplicationsCacheTag(eventId));
  for (const segment of await eventUrlSegments(eventId)) {
    revalidatePath(`/dashboard/admin/events/${segment}`);
  }

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
export async function getEventWaitlist(
  eventId: string,
): Promise<ActionResult<WaitlistEntry[]>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');
  await requirePermission(user.id, 'rsvp:read:all');
  if (!eventId.trim()) return fail('Event ID is required.');
  return ok(await getWaitlist(eventId));
}

export type { WaitlistEntry } from '@/lib/rsvp/waitlist';

export type FormedTeamMember = {
  userId: string;
  name: string;
  email: string;
  isOrganizer: boolean;
};

export type FormedTeamRow = {
  teamId: string;
  organizerId: string;
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
export async function getFormedTeamsForEvent(
  eventId: string,
): Promise<ActionResult<FormedTeamRow[]>> {
  const authUser = await getUser();
  if (!authUser) return fail('Not authenticated');
  await requirePermission(authUser.id, 'team:read:all');

  try {
    return await listFormedTeams(eventId);
  } catch (error) {
    console.error('getFormedTeamsForEvent error:', error);
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
  return hasPermission(authUser.id, 'team:manage:all');
}

async function listFormedTeams(
  eventId: string,
): Promise<ActionResult<FormedTeamRow[]>> {
  const formedTeams = await db
    .select({ teamId: teamMembers.teamId, memberCount: count() })
    .from(teamMembers)
    .where(eq(teamMembers.eventId, eventId))
    .groupBy(teamMembers.teamId)
    .having(sql`count(*) > 1`);

  if (formedTeams.length === 0) return ok([]);

  const teamIds = formedTeams.map((t) => t.teamId);
  const countByTeamId = new Map(
    formedTeams.map((t) => [t.teamId, t.memberCount]),
  );

  const [teamRows, memberRows] = await Promise.all([
    db
      .select({ id: teams.id, organizerId: teams.organizerId })
      .from(teams)
      .where(inArray(teams.id, teamIds)),
    db
      .select({
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        name: user.name,
        email: user.email,
      })
      .from(teamMembers)
      .innerJoin(user, eq(teamMembers.userId, user.id))
      .where(inArray(teamMembers.teamId, teamIds)),
  ]);

  const membersByTeamId = new Map<string, FormedTeamMember[]>();
  for (const row of memberRows) {
    const list = membersByTeamId.get(row.teamId) ?? [];
    list.push({
      userId: row.userId,
      name: row.name,
      email: row.email,
      isOrganizer: false,
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
