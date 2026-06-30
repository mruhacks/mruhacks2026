/**
 * Pure helpers for event_applications.responses.
 * Responses are keyed by question UUID (ApplicationQuestion.id).
 */

import { z } from 'zod';
import type { ApplicationQuestion, ApplicationQuestionType } from '@/types/application';

export type BuildApplicationResponsesResult =
  | { ok: true; responses: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Creates a Zod schema for a single question based on its type.
 */
function createQuestionSchema(question: ApplicationQuestion) {
  const baseSchema = getBaseSchema(question.type);
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
function getBaseSchema(type: ApplicationQuestionType) {
  switch (type) {
    case 'short_text':
      return z.string().trim().min(1, 'Cannot be empty');
    case 'long_text':
      return z.string().trim().min(1, 'Cannot be empty');
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
  }

  return { ok: true, responses };
}
