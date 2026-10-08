import { z } from 'zod';

import {
  SUBMISSION_MARKDOWN_MAX_LENGTH,
  SUBMISSION_TITLE_MAX_LENGTH,
  submissionLinkError,
  type SubmissionLinkKind,
} from '@/lib/submissions';

/** An optional link: blank means "none", anything else must pass its host rule. */
const linkSchema = (kind: SubmissionLinkKind) =>
  z
    .string()
    .trim()
    .max(2048, 'Links cannot exceed 2,048 characters')
    .superRefine((value, ctx) => {
      if (!value) return;
      const error = submissionLinkError(kind, value);
      if (error) ctx.addIssue({ code: 'custom', message: error });
    })
    .transform((value) => value || null);

/** Rules every project field follows, whether it's being saved or made public. */
const contentShape = {
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(
      SUBMISSION_TITLE_MAX_LENGTH,
      `Title cannot exceed ${SUBMISSION_TITLE_MAX_LENGTH} characters`,
    ),
  markdown: z
    .string()
    .max(
      SUBMISSION_MARKDOWN_MAX_LENGTH,
      `Write-up cannot exceed ${SUBMISSION_MARKDOWN_MAX_LENGTH.toLocaleString()} characters`,
    ),
  /** One of this submission's own `/api/assets/submission-content/…` URLs. */
  coverImageUrl: z.string().max(512).nullable(),
};

export const saveSubmissionSchema = z.object({
  ...contentShape,
  repoUrl: linkSchema('repo'),
  demoUrl: linkSchema('demo'),
  videoUrl: linkSchema('video'),
  /** The `updatedAt` the editor loaded — the stale-save check compares it. */
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  /** "Overwrite with mine": skip the stale-save check. */
  force: z.boolean().default(false),
});

/** A stored link column: null means "none", which a blank string also does. */
const storedLink = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .nullable()
    .transform((value) => value ?? '')
    .pipe(schema);

/**
 * What a project needs before it can be made public. The editor checks its
 * current fields on "Make public", and `setSubmissionPublished` checks the saved
 * row, so a teammate's stale tab can't make an incomplete project public.
 */
export const publishSubmissionSchema = z.object({
  ...contentShape,
  repoUrl: storedLink(
    linkSchema('repo').refine((value) => value !== null, {
      message: 'Add a repository link to make your project public.',
    }),
  ),
  demoUrl: storedLink(linkSchema('demo')),
  videoUrl: storedLink(linkSchema('video')),
});

export type SaveSubmissionInput = z.input<typeof saveSubmissionSchema>;
/** Field names a save error can point at, so the editor shows it inline. */
export type SubmissionField =
  | 'title'
  | 'markdown'
  | 'coverImageUrl'
  | 'repoUrl'
  | 'demoUrl'
  | 'videoUrl';
