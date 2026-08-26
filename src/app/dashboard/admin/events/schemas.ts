import { z } from 'zod';
import { QUESTION_MAX_LENGTH_LIMIT } from '@/types/application';

const questionTypeSchema = z.enum([
  'short_text',
  'long_text',
  'single_select',
  'multi_select',
  'number',
  'boolean',
  'section_divider',
]);

/**
 * Character cap for string-shaped questions. `null` clears an explicit cap and
 * falls the question back to the per-type default.
 */
const maxLengthSchema = z
  .number()
  .int()
  .min(1, 'Max length must be at least 1')
  .max(QUESTION_MAX_LENGTH_LIMIT, `Max length cannot exceed ${QUESTION_MAX_LENGTH_LIMIT}`)
  .nullish();

export const addQuestionSchema = z.object({
  label: z.string().trim().min(1, 'Label is required'),
  type: questionTypeSchema,
  description: z.string().trim().optional(),
  required: z.boolean().default(false),
  maxLength: maxLengthSchema,
  showInApplicationReview: z.boolean().default(false),
  showInReports: z.boolean().default(false),
  options: z
    .array(z.object({ label: z.string().trim().min(1, 'Option label is required') }))
    .optional(),
});

export type AddQuestionInput = z.input<typeof addQuestionSchema>;

/** Option entry for editing: existing options have a value UUID; new ones omit it. */
const editOptionSchema = z.object({
  value: z.string().optional(),
  label: z.string().trim().min(1, 'Option label is required'),
  active: z.boolean().default(true),
});

export const editQuestionSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').optional(),
  description: z.string().trim().optional(),
  required: z.boolean().optional(),
  maxLength: maxLengthSchema,
  showInApplicationReview: z.boolean().optional(),
  showInReports: z.boolean().optional(),
  options: z.array(editOptionSchema).optional(),
});

export type EditQuestionInput = z.infer<typeof editQuestionSchema>;

// ── Event schemas ────────────────────────────────────────────────────────

export const createEventSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required'),
  hasApplication: z.boolean().default(false),
  capacity: z.number().int().positive().nullish(),
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  isFeatured: z.boolean().optional(),
}).refine(
  (data) => {
    if (!data.startsAt || !data.endsAt) return true;
    return new Date(data.startsAt) < new Date(data.endsAt);
  },
  {
    message: 'Start date must be before end date',
    path: ['startsAt'],
  }
);

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').optional(),
  hasApplication: z.boolean().optional(),
  capacity: z.number().int().positive().nullish(),
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  isFeatured: z.boolean().optional(),
}).refine(
  (data) => {
    if (!data.startsAt || !data.endsAt) return true;
    return new Date(data.startsAt) < new Date(data.endsAt);
  },
  {
    message: 'Start date must be before end date',
    path: ['startsAt'],
  }
);

export type UpdateEventSettingsInput = z.infer<typeof updateEventSettingsSchema>;
