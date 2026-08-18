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
        ctx.addIssue({ code: 'custom', message: `Enter a valid ${label} URL.` });
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

/** Profile-only (no attendedBefore; that is event-specific and stored in event_applications.responses). */
export const personalSchema = z.object({
  fullName: z.string().trim().min(1, 'Required'),
  genderId: requiredOption('Required'),
  genderOtherText: otherTextSchema,
  universityId: requiredOption('Required'),
  universityOtherText: otherTextSchema,
  majorId: requiredOption('Required'),
  majorOtherText: otherTextSchema,
  yearOfStudyId: requiredOption('Required'),
});

export const aboutSchema = z.object({
  dietaryRestrictions: z.array(z.number('Required')),
  dietaryOtherText: otherTextSchema,
  linkedinUrl: linkedinUrlSchema,
  githubUrl: githubUrlSchema,
});

/** Profile-only form (for ProfileForm / saveUserProfile): personal + dietary restrictions + socials; no accommodations, attendedBefore, or applicationResponses. */
export const profileFormSchema = z.object({
  ...personalSchema.shape,
  ...aboutSchema.shape,
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export type ProfileSelectOption = { value: number; label: string };

export type ProfileFormOptions = {
  genders: ProfileSelectOption[];
  universities: ProfileSelectOption[];
  majors: ProfileSelectOption[];
  years: ProfileSelectOption[];
  dietary: ProfileSelectOption[];
};
