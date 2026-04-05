/**
 * Server actions for the application form builder.
 * Manages CRUD operations on events.applicationQuestions JSONB column.
 *
 * Invariants enforced:
 * - If applications exist for the event, question type is immutable
 * - Options with existing responses cannot be deleted (only new options may be added)
 * - Questions with responses are soft-deleted (active = false) rather than removed
 */

'use server';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/utils/db';
import { events, eventApplications } from '@/db/schema';
import { getUser } from '@/utils/auth';
import { type ActionResult, ok, fail } from '@/utils/action-result';
import type { ApplicationQuestion } from '@/types/application';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getEventQuestions(
  eventId: string,
): Promise<ApplicationQuestion[]> {
  const [row] = await db
    .select({ applicationQuestions: events.applicationQuestions })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  return (row?.applicationQuestions as ApplicationQuestion[] | null) ?? [];
}

async function saveEventQuestions(
  eventId: string,
  questions: ApplicationQuestion[],
): Promise<void> {
  await db
    .update(events)
    .set({ applicationQuestions: questions })
    .where(eq(events.id, eventId));
}

async function eventHasApplications(eventId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventApplications)
    .where(eq(eventApplications.eventId, eventId));
  return (row?.count ?? 0) > 0;
}

/** Collect all question IDs that have at least one non-null response value. */
async function questionIdsWithResponses(eventId: string): Promise<Set<string>> {
  const rows = await db
    .select({ responses: eventApplications.responses })
    .from(eventApplications)
    .where(eq(eventApplications.eventId, eventId));

  const ids = new Set<string>();
  for (const row of rows) {
    const resp = row.responses as Record<string, unknown> | null;
    if (!resp) continue;
    for (const [key, value] of Object.entries(resp)) {
      if (value !== undefined && value !== null && value !== '') {
        ids.add(key);
      }
    }
  }
  return ids;
}

/** Collect option values that appear in at least one response for a given question ID. */
async function optionValuesWithResponses(
  eventId: string,
  questionId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ responses: eventApplications.responses })
    .from(eventApplications)
    .where(eq(eventApplications.eventId, eventId));

  const values = new Set<string>();
  for (const row of rows) {
    const resp = row.responses as Record<string, unknown> | null;
    if (!resp) continue;
    const val = resp[questionId];
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      for (const v of val) values.add(String(v));
    } else {
      values.add(String(val));
    }
  }
  return values;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function getFormBuilderData(eventId: string): Promise<
  ActionResult<{
    event: { id: string; name: string; hasApplication: boolean };
    questions: ApplicationQuestion[];
    hasApplications: boolean;
  }>
> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');

  const [event] = await db
    .select({
      id: events.id,
      name: events.name,
      hasApplication: events.hasApplication,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) return fail('Event not found');

  const questions = await getEventQuestions(eventId);
  const hasApplications = await eventHasApplications(eventId);

  return ok({ event, questions, hasApplications });
}

// ---------------------------------------------------------------------------
// Add question
// ---------------------------------------------------------------------------

export async function addQuestion(
  eventId: string,
  question: Omit<ApplicationQuestion, 'order' | 'active'>,
): Promise<ActionResult<ApplicationQuestion[]>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');

  if (!question.label.trim()) return fail('Label is required');
  if (!question.type) return fail('Type is required');

  const questions = await getEventQuestions(eventId);

  const maxOrder = questions.reduce((max, q) => Math.max(max, q.order), 0);

  const newQuestion: ApplicationQuestion = {
    ...question,
    label: question.label.trim(),
    description: question.description?.trim() || undefined,
    order: maxOrder + 1,
    active: true,
  };

  const updated = [...questions, newQuestion];
  await saveEventQuestions(eventId, updated);
  return ok(updated);
}

// ---------------------------------------------------------------------------
// Edit question
// ---------------------------------------------------------------------------

export async function editQuestion(
  eventId: string,
  questionId: string,
  changes: Partial<
    Pick<
      ApplicationQuestion,
      'label' | 'description' | 'required' | 'options' | 'type'
    >
  >,
): Promise<ActionResult<ApplicationQuestion[]>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');

  const questions = await getEventQuestions(eventId);
  const idx = questions.findIndex((q) => q.id === questionId);
  if (idx === -1) return fail('Question not found');

  const existing = questions[idx];
  const hasApps = await eventHasApplications(eventId);

  // Invariant: type is immutable if responses exist
  if (changes.type !== undefined && changes.type !== existing.type && hasApps) {
    const respondedIds = await questionIdsWithResponses(eventId);
    if (respondedIds.has(questionId)) {
      return fail(
        'Cannot change question type because responses already exist',
      );
    }
  }

  // Invariant: cannot remove options that have responses
  if (changes.options !== undefined && existing.options?.length && hasApps) {
    const usedValues = await optionValuesWithResponses(eventId, questionId);
    const newValues = new Set(
      (changes.options ?? []).map((o) => String(o.value)),
    );
    for (const used of usedValues) {
      if (!newValues.has(used)) {
        return fail(
          `Cannot remove option "${used}" because it has existing responses`,
        );
      }
    }
  }

  questions[idx] = {
    ...existing,
    ...(changes.label !== undefined && { label: changes.label.trim() }),
    ...(changes.description !== undefined && {
      description: changes.description.trim() || undefined,
    }),
    ...(changes.required !== undefined && { required: changes.required }),
    ...(changes.options !== undefined && { options: changes.options }),
    ...(changes.type !== undefined && { type: changes.type }),
  };

  await saveEventQuestions(eventId, questions);
  return ok(questions);
}

// ---------------------------------------------------------------------------
// Remove question
// ---------------------------------------------------------------------------

export async function removeQuestion(
  eventId: string,
  questionId: string,
): Promise<ActionResult<ApplicationQuestion[]>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');

  const questions = await getEventQuestions(eventId);
  const idx = questions.findIndex((q) => q.id === questionId);
  if (idx === -1) return fail('Question not found');

  const hasApps = await eventHasApplications(eventId);

  if (hasApps) {
    const respondedIds = await questionIdsWithResponses(eventId);
    if (respondedIds.has(questionId)) {
      // Soft-delete: mark inactive
      questions[idx] = { ...questions[idx], active: false };
      await saveEventQuestions(eventId, questions);
      return ok(questions);
    }
  }

  // Hard delete if no applications or no responses for this question
  const updated = questions.filter((q) => q.id !== questionId);
  await saveEventQuestions(eventId, updated);
  return ok(updated);
}

// ---------------------------------------------------------------------------
// Reorder questions
// ---------------------------------------------------------------------------

export async function reorderQuestions(
  eventId: string,
  orderedIds: string[],
): Promise<ActionResult<ApplicationQuestion[]>> {
  const user = await getUser();
  if (!user) return fail('Not authenticated');

  const questions = await getEventQuestions(eventId);
  const map = new Map(questions.map((q) => [q.id, q]));

  const reordered: ApplicationQuestion[] = [];
  let order = 1;
  for (const id of orderedIds) {
    const q = map.get(id);
    if (q) {
      reordered.push({ ...q, order: order++ });
      map.delete(id);
    }
  }
  // Append any questions not in orderedIds (e.g., inactive ones)
  for (const q of map.values()) {
    reordered.push({ ...q, order: order++ });
  }

  await saveEventQuestions(eventId, reordered);
  return ok(reordered);
}
