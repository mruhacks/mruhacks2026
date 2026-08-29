/**
 * Pure helpers for event_applications.responses.
 * Responses are keyed by question UUID (ApplicationQuestion.id).
 */

import type { ApplicationQuestion } from '@/types/application';
import { isOtherOption, otherTextKey } from '@/lib/other-option';
import {
  applicationOtherTextSchema,
  createApplicationQuestionSchema,
} from '@/components/application-form/schema';

export type BuildApplicationResponsesResult =
  | { ok: true; responses: Record<string, unknown> }
  | { ok: false; error: string };

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
    const schema = createApplicationQuestionSchema(question);

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
        isOtherOption(question.options?.find((o) => o.value === value)?.label),
      );

      if (otherSelected) {
        const otherKey = otherTextKey(question.id);
        const otherResult = applicationOtherTextSchema.safeParse(
          formResponses[otherKey],
        );
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
