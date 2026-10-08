import { z } from 'zod';

const requiredOption = (message: string) =>
  z.coerce.number(message).int().positive(message);

/**
 * Validates an optional profile link against a single allowed host (exact
 * match, so `linkedin.com.evil.com` or `evil.com/linkedin.com` are rejected)
 * and normalizes it: forces https, strips query params and the hash
 * fragment. Empty/missing input passes through as `''`.
 */
function socialUrlSchema(host: string, label: string) {
  return z
    .string()
    .optional()
    .transform((raw, ctx) => {
      const value = (raw ?? '').trim();
      if (!value) return '';

      let url: URL;
      try {
        url = new URL(value);
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: `Enter a valid ${label} URL.`,
        });
        return z.NEVER;
      }

      const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        hostname !== host
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `Enter a ${label} URL (${host}).`,
        });
        return z.NEVER;
      }

      url.protocol = 'https:';
      url.search = '';
      url.hash = '';
      const clean = url.toString();
      return clean.length > 1 && clean.endsWith('/')
        ? clean.slice(0, -1)
        : clean;
    });
}

export const linkedinUrlSchema = socialUrlSchema('linkedin.com', 'LinkedIn');
export const githubUrlSchema = socialUrlSchema('github.com', 'GitHub');

/** Free-text "please specify" companion for a select's "Other" option. */
const otherTextSchema = z
  .string()
  .trim()
  .max(255, 'Keep it under 255 characters.')
  .optional()
  .or(z.literal(''));

/**
 * Mirrors the welcome wizard's Personal step: who you are, dietary needs and
 * LinkedIn. LinkedIn lives here rather than in About/Professional because it's
 * one value shared by the student and professional profiles.
 */
export const personalSchema = z.object({
  fullName: z.string().trim().min(1, 'Required'),
  genderId: requiredOption('Required'),
  genderOtherText: otherTextSchema,
  dietaryRestrictions: z.array(z.number('Required')),
  dietaryOtherText: otherTextSchema,
  linkedinUrl: linkedinUrlSchema,
});

/** Mirrors the welcome wizard's About step: academic info + GitHub (no attendedBefore; that's wizard-only, not part of this shared schema). */
export const aboutSchema = z.object({
  universityId: requiredOption('Required'),
  universityOtherText: otherTextSchema,
  majorId: requiredOption('Required'),
  majorOtherText: otherTextSchema,
  yearOfStudyId: requiredOption('Required'),
  githubUrl: githubUrlSchema,
});

/** Professional-step payload: what judges fill in instead of the About step. */
export const professionalSchema = z.object({
  company: z
    .string()
    .trim()
    .min(1, 'Enter your company or organization.')
    .max(255, 'Keep it under 255 characters.'),
  jobTitle: z
    .string()
    .trim()
    .min(1, 'Enter your job title.')
    .max(255, 'Keep it under 255 characters.'),
});

/** About-step payload, including the onboarding-only hackathon-history field. */
export const welcomeAboutSchema = aboutSchema.extend({
  attendedHackathonBefore: z.boolean(),
});

/** Profile-only form (for ProfileForm / saveFullProfile): personal + dietary restrictions + socials; no accommodations, attendedBefore, or applicationResponses. */
export const profileFormSchema = z.object({
  ...personalSchema.shape,
  ...aboutSchema.shape,
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

/** A select left blank reads as "not answered", not as an invalid 0. */
const optionalOption = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const ACADEMIC_FIELDS = ['universityId', 'majorId', 'yearOfStudyId'] as const;

/**
 * The dashboard profile form for a judge: the Personal half is required as
 * usual, but the student half is optional — a judge who never takes part as a
 * hacker has no university to give. It's all-or-nothing, though: the About
 * row needs all three academic answers, so once any student field is filled
 * in, the three become required.
 */
export const profileFormOptionalAboutSchema = z
  .object({
    ...personalSchema.shape,
    ...aboutSchema.shape,
    universityId: optionalOption,
    majorId: optionalOption,
    yearOfStudyId: optionalOption,
  })
  .superRefine((data, ctx) => {
    if (!hasStudentDetails(data)) return;
    for (const field of ACADEMIC_FIELDS) {
      if (data[field] == null) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: 'Required to save your student details.',
        });
      }
    }
  });

/** The dashboard form's values; academic answers may be blank for a judge. */
export type ProfileFormInput = z.infer<typeof profileFormOptionalAboutSchema>;

/** Whether any student (About) field has been filled in. */
export function hasStudentDetails(
  data: Pick<
    ProfileFormInput,
    | (typeof ACADEMIC_FIELDS)[number]
    | 'universityOtherText'
    | 'majorOtherText'
    | 'githubUrl'
  >,
): boolean {
  return (
    ACADEMIC_FIELDS.some((field) => data[field] != null) ||
    [data.universityOtherText, data.majorOtherText, data.githubUrl].some(
      (value) => (value ?? '').trim() !== '',
    )
  );
}

export type ProfileSelectOption = { value: number; label: string };

export type ProfileFormOptions = {
  genders: ProfileSelectOption[];
  universities: ProfileSelectOption[];
  majors: ProfileSelectOption[];
  years: ProfileSelectOption[];
  dietary: ProfileSelectOption[];
};
