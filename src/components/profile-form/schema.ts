import { z } from "zod";

/** Profile-only (no attendedBefore; that is event-specific and stored in event_applications.responses). */
export const personalSchema = z.object({
  fullName: z.string().trim().min(1, "Required"),
  genderId: z.coerce.number().int().positive("Required"),
  universityId: z.coerce.number().int().positive("Required"),
  majorId: z.coerce.number().int().positive("Required"),
  yearOfStudyId: z.coerce.number().int().positive("Required"),
});

export const interestsSchema = z.object({
  interests: z.array(z.number()).nonempty("Select at least one interest."),
  dietaryRestrictions: z.array(z.number("Required")),
  accommodations: z.string().max(500).optional(),
});

/** Profile-only form (for ProfileForm / saveUserProfile): personal + interests + dietaryRestrictions; no accommodations, attendedBefore, or applicationResponses. */
export const profileFormSchema = z.object({
  ...personalSchema.shape,
  interests: interestsSchema.shape.interests,
  dietaryRestrictions: interestsSchema.shape.dietaryRestrictions,
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
