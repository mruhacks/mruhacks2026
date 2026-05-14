/**
 * Pure helpers for diffing/validating application question edits.
 * No 'use server' — usable in both server actions and tests.
 */

import type { ApplicationQuestion, ApplicationQuestionOption } from '@/types/application';
import type { EditQuestionInput } from '@/app/dashboard/admin/events/schemas';

export type QuestionEditResult =
  | { ok: true; question: ApplicationQuestion }
  | { ok: false; error: string };

/**
 * Returns true if any response in the set references the given question ID
 * with the given option value (for single_select / multi_select).
 */
export function hasResponsesForOption(
  allResponses: Record<string, unknown>[],
  questionId: string,
  optionValue: string,
): boolean {
  for (const responses of allResponses) {
    const answer = responses[questionId];
    if (Array.isArray(answer) && answer.includes(optionValue)) return true;
    if (answer === optionValue) return true;
  }
  return false;
}

/**
 * Returns true if any response references the given question at all.
 */
export function hasResponsesForQuestion(
  allResponses: Record<string, unknown>[],
  questionId: string,
): boolean {
  return allResponses.some(
    (r) => r[questionId] !== undefined && r[questionId] !== null,
  );
}

/**
 * Validates and merges an edit patch onto an existing question, enforcing:
 * - Type is immutable when responses exist.
 * - Options with responses cannot be hard-removed (only marked inactive).
 *
 * Returns the merged question or an error string.
 */
export function validateQuestionEdit(
  existing: ApplicationQuestion,
  patch: EditQuestionInput,
  allResponses: Record<string, unknown>[],
): QuestionEditResult {
  const hasResponses = hasResponsesForQuestion(allResponses, existing.id);

  // Build merged options list
  let mergedOptions: ApplicationQuestionOption[] | undefined = existing.options;

  if (patch.options !== undefined) {
    const patchOptions = patch.options;

    if (hasResponses) {
      // Build a map of existing options
      const existingByValue = new Map<string, ApplicationQuestionOption>(
        (existing.options ?? []).map((o) => [o.value, o]),
      );

      const result: ApplicationQuestionOption[] = [];

      // Process patched options
      const seenValues = new Set<string>();
      for (const p of patchOptions) {
        if (p.value) {
          // Existing option — allow label/active changes
          seenValues.add(p.value);
          const orig = existingByValue.get(p.value);
          if (!orig) {
            return { ok: false, error: `Unknown option value: ${p.value}` };
          }
          // If this option has responses, it cannot be deactivated
          if (
            !p.active &&
            hasResponsesForOption(allResponses, existing.id, p.value)
          ) {
            return {
              ok: false,
              error: `Option "${orig.label}" has existing responses and cannot be removed.`,
            };
          }
          result.push({ value: p.value, label: p.label, active: p.active ?? orig.active });
        } else {
          // New option — assign a fresh UUID
          const { randomUUID } = require('crypto') as typeof import('crypto');
          result.push({ value: randomUUID(), label: p.label, active: true });
        }
      }

      // Any existing option not in the patch that has responses must be kept (active)
      for (const existing_opt of existing.options ?? []) {
        if (!seenValues.has(existing_opt.value)) {
          if (hasResponsesForOption(allResponses, existing.id, existing_opt.value)) {
            return {
              ok: false,
              error: `Option "${existing_opt.label}" has existing responses and cannot be removed. Mark it inactive instead.`,
            };
          }
          // No responses — allow omission (soft-delete by not including)
        }
      }

      mergedOptions = result;
    } else {
      // No responses — any option change allowed
      const { randomUUID } = require('crypto') as typeof import('crypto');
      mergedOptions = patchOptions.map((p) => ({
        value: p.value ?? randomUUID(),
        label: p.label,
        active: p.active ?? true,
      }));
    }
  }

  const merged: ApplicationQuestion = {
    ...existing,
    label: patch.label ?? existing.label,
    description: patch.description !== undefined ? patch.description : existing.description,
    required: patch.required !== undefined ? patch.required : existing.required,
    options: mergedOptions,
  };

  return { ok: true, question: merged };
}
