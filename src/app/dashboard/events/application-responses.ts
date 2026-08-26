/**
 * Pure helpers for event_applications.responses.
 * Responses are keyed by question UUID (ApplicationQuestion.id).
 */

import { z } from 'zod';
import type { ApplicationQuestion } from '@/types/application';
import { resolveMaxLength } from '@/types/application';
import { isOtherOption, otherTextKey } from '@/lib/other-option';

const otherTextSchema = z
  .string()
  .trim()
  .max(255, 'Keep it under 255 characters.')
  .optional()
  .nullable();

export type BuildApplicationResponsesResult =
  | { ok: true; responses: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Creates a Zod schema for a single question based on its type.
 */
function createQuestionSchema(question: ApplicationQuestion) {
  const baseSchema = getBaseSchema(question);
  // For required boolean fields, must be true (consent checkboxes)
  if (question.required && question.type === 'boolean') {
    return z.boolean().refine((val) => val === true, 'Must be checked');
  }
  const withRequired = question.required ? baseSchema : baseSchema.optional().nullable();
  return withRequired;
}

/**
 * Returns the base Zod schema for each question type.
 */
function getBaseSchema(question: ApplicationQuestion) {
  switch (question.type) {
    case 'short_text':
    case 'long_text': {
      let schema = z.string().trim().min(1, 'Cannot be empty');
      const maxLength = resolveMaxLength(question);
      if (maxLength != null) {
        schema = schema.max(maxLength, `Keep it under ${maxLength} characters.`);
      }
      return schema;
    }
    case 'number':
      return z.number().or(z.string().pipe(z.coerce.number()));
    case 'boolean':
      return z.boolean();
    case 'single_select':
      return z.string().min(1, 'Must select an option');
    case 'multi_select':
      return z.array(z.string()).min(1, 'Must select at least one option');
    case 'section_divider':
      // Section dividers don't have responses
      return z.unknown().optional().nullable();
    default:
      return z.unknown();
  }
}

/**
 * Builds and validates the responses object for event_applications.responses.
 * - Skips inactive questions
 * - Validates types and required fields using Zod
 * - Returns detailed error messages
 */
export function buildApplicationResponses(
  applicationQuestions: ApplicationQuestion[],
  formResponses: Record<string, unknown>,
): BuildApplicationResponsesResult {
  const responses: Record<string, unknown> = {};

  for (const question of applicationQuestions) {
    // Skip inactive questions and section dividers (they hold no response data)
    if (!question.active) continue;
    if (question.type === 'section_divider') continue;

    const value = formResponses[question.id];
    const schema = createQuestionSchema(question);

    // Validate the value against the schema
    const result = schema.safeParse(value);

    if (!result.success) {
      // Extract the first validation error
      const issue = result.error.issues[0];
      const errorMessage = issue?.message || 'Invalid response';
      return { ok: false, error: `${question.label}: ${errorMessage}` };
    }

    // Only include defined values in the response
    if (result.data !== undefined && result.data !== null) {
      responses[question.id] = result.data;
    }

    // When an "Other" option is selected, validate and carry along the
    // companion free-text answer stored under the synthetic `__other` key.
    if (question.type === 'single_select' || question.type === 'multi_select') {
      const selectedLabels =
        question.type === 'single_select'
          ? [result.data as string | undefined]
          : ((result.data as string[] | undefined) ?? []);
      const otherSelected = selectedLabels.some((value) =>
        isOtherOption(
          question.options?.find((o) => o.value === value)?.label,
        ),
      );

      if (otherSelected) {
        const otherKey = otherTextKey(question.id);
        const otherResult = otherTextSchema.safeParse(formResponses[otherKey]);
        if (!otherResult.success) {
          const issue = otherResult.error.issues[0];
          return {
            ok: false,
            error: `${question.label}: ${issue?.message || 'Invalid response'}`,
          };
        }
        if (otherResult.data) {
          responses[otherKey] = otherResult.data;
        }
      }
    }
  }

  return { ok: true, responses };
}
