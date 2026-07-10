import { z } from 'zod';
import type { ApplicationQuestion } from '@/types/application';

/** Event-specific answers keyed by question UUID. Validated server-side against event.applicationQuestions. */
const applicationResponsesSchema = z.record(z.string(), z.unknown());

/** Event-only form: applicationResponses keyed by question UUID. */
const eventOnlySchema = z.object({
  applicationResponses: z.record(z.string(), z.unknown()).default({}),
});

export type EventOnlyFormValues = z.infer<typeof eventOnlySchema>;

export type ApplicationSelectOption = { value: string; label: string };

/**
 * Generates a Zod schema for validation based on application questions.
 * Creates field-level validation rules for each question type.
 */
export function createApplicationFormSchema(
  questions: ApplicationQuestion[] | null,
) {
  const responsesSchema: Record<string, z.ZodTypeAny> = {};

  if (!questions) {
    return z.object({
      applicationResponses: z.record(z.string(), z.unknown()).default({}),
    });
  }

  for (const question of questions) {
    if (!question.active) continue;

    // Section dividers don't need validation
    if (question.type === 'section_divider') continue;

    const questionId = question.id;
    let fieldSchema: z.ZodTypeAny;

    switch (question.type) {
      case 'short_text':
      case 'long_text':
        fieldSchema = z
          .string()
          .trim()
          .min(1, `At least one option must be selected`);
        break;

      case 'number':
        fieldSchema = z
          .number('Must be a number')
          .or(z.string().pipe(z.coerce.number('Must be a number')));
        break;

      case 'boolean':
        if (question.required) {
          fieldSchema = z.boolean().refine((val) => val === true, {
            message: `Must be checked`,
          });
        } else {
          fieldSchema = z.boolean().optional().nullable();
        }
        break;

      case 'single_select':
        fieldSchema = z
          .string()
          .min(1, `Please select an option for ${question.label}`);
        break;

      case 'multi_select':
        fieldSchema = z
          .array(z.string())
          .min(1, `Please select at least one option for ${question.label}`);
        break;

      default:
        fieldSchema = z.unknown();
    }

    // Apply required/optional logic
    if (question.required && question.type !== 'boolean') {
      responsesSchema[questionId] = fieldSchema;
    } else if (question.type !== 'boolean') {
      responsesSchema[questionId] = fieldSchema.optional().nullable();
    } else {
      responsesSchema[questionId] = fieldSchema;
    }
  }

  return z.object({
    applicationResponses: z.object(responsesSchema).default({}),
  });
}
