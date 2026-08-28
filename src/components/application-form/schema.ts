import { z } from 'zod';
import {
  resolveMaxLength,
  type ApplicationQuestion,
} from '@/types/application';
import { otherTextKey } from '@/lib/other-option';

export const applicationOtherTextSchema = z
  .string({ error: 'Please enter text.' })
  .trim()
  .max(255, 'Keep it under 255 characters.')
  .optional()
  .nullable();

/** Event-only form: applicationResponses keyed by question UUID. */
export const eventOnlySchema = z.object({
  applicationResponses: z.record(z.string(), z.unknown()).default({}),
});

export type EventOnlyFormValues = z.infer<typeof eventOnlySchema>;

export type ApplicationSelectOption = { value: string; label: string };

/** Builds the client/server validation rule for one active event question. */
export function createApplicationQuestionSchema(
  question: ApplicationQuestion,
): z.ZodTypeAny {
  let fieldSchema: z.ZodTypeAny;

  switch (question.type) {
    case 'short_text':
    case 'long_text': {
      const max = resolveMaxLength(question)!;
      const answerRequired = 'Please enter an answer.';
      fieldSchema = z
        .string({ error: answerRequired })
        .trim()
        .min(1, answerRequired)
        .max(max, `Keep it under ${max} characters.`);
      break;
    }

    case 'number': {
      const validNumber = 'Please enter a valid number.';
      fieldSchema = z.union(
        [
          z.number({ error: validNumber }),
          z
            .string({ error: validNumber })
            .trim()
            .min(1, validNumber)
            .pipe(z.coerce.number({ error: validNumber })),
        ],
        { error: validNumber },
      );
      break;
    }

    case 'boolean': {
      const booleanError = question.required
        ? 'Please check this box to continue.'
        : 'Please choose yes or no.';
      fieldSchema = z.boolean({ error: booleanError });
      if (question.required) {
        return fieldSchema.refine((value) => value === true, {
          message: booleanError,
        });
      }
      return fieldSchema.optional().nullable();
    }

    case 'single_select': {
      const selectOption = 'Please select an option.';
      fieldSchema = z.string({ error: selectOption }).min(1, selectOption);
      break;
    }

    case 'multi_select': {
      const selectOptions = 'Please select at least one option.';
      fieldSchema = z
        .array(z.string(), { error: selectOptions })
        .min(1, selectOptions);
      break;
    }

    case 'section_divider':
      return z.unknown().optional().nullable();

    default:
      fieldSchema = z.unknown();
  }

  return question.required ? fieldSchema : fieldSchema.optional().nullable();
}

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

    responsesSchema[question.id] = createApplicationQuestionSchema(question);
    if (question.type === 'single_select' || question.type === 'multi_select') {
      responsesSchema[otherTextKey(question.id)] = applicationOtherTextSchema;
    }
  }

  return z.object({
    applicationResponses: z.object(responsesSchema).default({}),
  });
}
