import { z } from 'zod';
import { QUESTION_MAX_LENGTH_LIMIT } from '@/types/application';
import {
  ARTICLE_SLUG_MAX_LENGTH,
  isValidArticleSlug,
} from '@/lib/article-slug';

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
  .max(
    QUESTION_MAX_LENGTH_LIMIT,
    `Max length cannot exceed ${QUESTION_MAX_LENGTH_LIMIT}`,
  )
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
    .array(
      z.object({ label: z.string().trim().min(1, 'Option label is required') }),
    )
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

export const createEventSchema = z
  .object({
    name: z.string().trim().min(1, 'Event name is required'),
    hasApplication: z.boolean().default(false),
    capacity: z.number().int().positive().nullish(),
    startsAt: z.string().nullish(),
    endsAt: z.string().nullish(),
    isFeatured: z.boolean().optional(),
    teamsEnabled: z.boolean().optional(),
    maxTeamSize: z.number().int().positive().nullish(),
  })
  .refine(
    (data) => {
      if (!data.startsAt || !data.endsAt) return true;
      return new Date(data.startsAt) < new Date(data.endsAt);
    },
    {
      message: 'Start date must be before end date',
      path: ['startsAt'],
    },
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSettingsSchema = z
  .object({
    name: z.string().trim().min(1, 'Event name is required').optional(),
    hasApplication: z.boolean().optional(),
    capacity: z.number().int().positive().nullish(),
    startsAt: z.string().nullish(),
    endsAt: z.string().nullish(),
    isFeatured: z.boolean().optional(),
    teamsEnabled: z.boolean().optional(),
    maxTeamSize: z.number().int().positive().nullish(),
  })
  .refine(
    (data) => {
      if (!data.startsAt || !data.endsAt) return true;
      return new Date(data.startsAt) < new Date(data.endsAt);
    },
    {
      message: 'Start date must be before end date',
      path: ['startsAt'],
    },
  );

export type UpdateEventSettingsInput = z.infer<
  typeof updateEventSettingsSchema
>;

// ── Markdown content schemas ─────────────────────────────────────────────

/**
 * Upper bounds on stored markdown. These are deliberately generous — they
 * exist to stop a runaway paste or a scripted client from writing an
 * unbounded blob into a row that gets read on every page view, not to
 * discipline organizers about article length.
 */
const EVENT_DESCRIPTION_MAX_LENGTH = 20_000;
const ARTICLE_BODY_MAX_LENGTH = 200_000;
const ARTICLE_TITLE_MAX_LENGTH = 200;

const markdownBodySchema = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} cannot exceed ${max.toLocaleString()} characters`);

export const updateEventDescriptionSchema = z.object({
  descriptionMarkdown: markdownBodySchema(
    EVENT_DESCRIPTION_MAX_LENGTH,
    'Description',
  ),
});

const articleSlugSchema = z
  .string()
  .trim()
  .max(ARTICLE_SLUG_MAX_LENGTH)
  .refine(isValidArticleSlug, {
    message:
      'Use lowercase letters, numbers and single hyphens (e.g. "getting-started")',
  });

export const createArticleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(
      ARTICLE_TITLE_MAX_LENGTH,
      `Title cannot exceed ${ARTICLE_TITLE_MAX_LENGTH} characters`,
    ),
  // Omitted means "derive it from the title".
  slug: articleSlugSchema.optional(),
});

export type CreateArticleInput = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(
      ARTICLE_TITLE_MAX_LENGTH,
      `Title cannot exceed ${ARTICLE_TITLE_MAX_LENGTH} characters`,
    )
    .optional(),
  slug: articleSlugSchema.optional(),
  bodyMarkdown: markdownBodySchema(
    ARTICLE_BODY_MAX_LENGTH,
    'Article',
  ).optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
