import { z } from 'zod';

export const questionTypeSchema = z.enum([
  'short_text',
  'long_text',
  'single_select',
  'multi_select',
  'number',
  'boolean',
]);

export const addQuestionSchema = z.object({
  label: z.string().trim().min(1, 'Label is required'),
  type: questionTypeSchema,
  description: z.string().trim().optional(),
  required: z.boolean().default(false),
  options: z
    .array(z.object({ label: z.string().trim().min(1, 'Option label is required') }))
    .optional(),
});

export type AddQuestionInput = z.infer<typeof addQuestionSchema>;

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
  options: z.array(editOptionSchema).optional(),
});

export type EditQuestionInput = z.infer<typeof editQuestionSchema>;
