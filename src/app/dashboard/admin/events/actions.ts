'use server';

import { randomUUID } from 'crypto';
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { db } from '@/utils/db';
import { FEATURED_EVENT_CACHE_TAG } from '@/lib/featured-event';
import {
  events,
  eventApplications,
  user,
  userProfiles,
  teams,
  teamMembers,
} from '@/db/schema';
import { getUser } from '@/utils/auth';
import { ok, fail, type ActionResult } from '@/utils/action-result';
import { hasPermission, requirePermission } from '@/lib/rbac/authorization';
import {
  isSummarizableQuestion,
  type ApplicationQuestion,
} from '@/types/application';
import {
  addQuestionSchema,
  editQuestionSchema,
  createEventSchema,
  updateEventSettingsSchema,
} from './schemas';
import type {
  AddQuestionInput,
  EditQuestionInput,
  CreateEventInput,
  UpdateEventSettingsInput,
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

/** Fetch all event_applications.responses for a given event. */
async function fetchAllResponses(
  eventId: string,
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select({ responses: eventApplications.responses })
    .from(eventApplications)
    .where(eq(eventApplications.eventId, eventId));
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
    .from(eventApplications)
    .where(eq(eventApplications.eventId, eventId));

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

  // Convert datetime-local string to Date (datetime-local gives us "2026-05-13T14:30" format)
  const parseDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr);
    } catch {
      return null;
    }
  };

  const [newEvent] = await db
    .insert(events)
    .values({
      id: randomUUID(),
      name: input.name,
      hasApplication: input.hasApplication,
      capacity: input.capacity ?? null,
      teamsEnabled: input.teamsEnabled ?? false,
      maxTeamSize: input.maxTeamSize ?? null,
      startsAt: parseDateTime(input.startsAt),
      endsAt: parseDateTime(input.endsAt),
      // Keep question configuration independent from the application-process
      // toggle. Events may require an application with no custom questions.
      applicationQuestions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: events.id });

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
  name: string;
  descriptionMarkdown: string;
  hasApplication: boolean;
  capacity: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isFeatured: boolean;
  teamsEnabled: boolean;
  maxTeamSize: number | null;
  createdAt: Date;
  updatedAt: Date;
  questionsCount: number;
  applicationsCount: number;
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
    .from(eventApplications)
    .where(eq(eventApplications.eventId, eventId));

  const questions = await fetchQuestions(eventId);
  const questionsCount = (questions ?? []).filter((q) => q.active).length;

  return ok({
    id: eventRow.id,
    name: eventRow.name,
    descriptionMarkdown: eventRow.descriptionMarkdown ?? '',
    hasApplication: eventRow.hasApplication,
    capacity: eventRow.capacity ?? null,
    startsAt: eventRow.startsAt ?? null,
    endsAt: eventRow.endsAt ?? null,
    isFeatured: eventRow.isFeatured,
    teamsEnabled: eventRow.teamsEnabled,
    maxTeamSize: eventRow.maxTeamSize ?? null,
    createdAt: eventRow.createdAt,
    updatedAt: eventRow.updatedAt,
    questionsCount,
    applicationsCount,
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

  // Convert datetime-local string to Date (datetime-local gives us "2026-05-13T14:30" format)
  const parseDateTime = (dateStr: string | null | undefined) => {
    if (dateStr === undefined) return undefined;
    if (!dateStr) return null;
    try {
      return new Date(dateStr);
    } catch {
      return null;
    }
  };

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
        hasApplication: input.hasApplication ?? eventRow.hasApplication,
        capacity: input.capacity ?? eventRow.capacity,
        teamsEnabled: input.teamsEnabled ?? eventRow.teamsEnabled,
        maxTeamSize:
          input.maxTeamSize !== undefined
            ? input.maxTeamSize
            : eventRow.maxTeamSize,
        startsAt:
          input.startsAt !== undefined
            ? parseDateTime(input.startsAt)
            : eventRow.startsAt,
        endsAt:
          input.endsAt !== undefined
            ? parseDateTime(input.endsAt)
            : eventRow.endsAt,
        isFeatured: input.isFeatured ?? eventRow.isFeatured,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));
  });

  // Homepage register-link lookup is cached; bust it so edits show up immediately.
  updateTag(FEATURED_EVENT_CACHE_TAG);

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
      userId: eventApplications.userId,
      email: user.email,
      fullName: userProfiles.fullName,
      responses: eventApplications.responses,
      createdAt: eventApplications.createdAt,
    })
    .from(eventApplications)
    .innerJoin(user, eq(eventApplications.userId, user.id))
    .leftJoin(userProfiles, eq(eventApplications.userId, userProfiles.userId))
    .where(eq(eventApplications.eventId, eventId))
    .orderBy(eventApplications.createdAt);

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
