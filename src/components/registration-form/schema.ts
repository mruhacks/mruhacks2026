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

/** Event-specific answers keyed by application question key. Validated in server action against event.applicationQuestions. */
export const applicationResponsesSchema = z.record(
  z.string(),
  z.unknown(),
);

/** Event-only section (attendedBefore, accommodations, applicationResponses). Merged with profile for registerParticipant. */
export const eventOnlySchema = z.object({
  attendedBefore: z.boolean(),
  accommodations: z.string().max(500).optional(),
  applicationResponses: z.record(z.string(), z.unknown()).default({}),
});

/** Full event application form: profile + interests + event-specific (attendedBefore, applicationResponses). */
export const formSchema = z.object({
  ...personalSchema.shape,
  ...interestsSchema.shape,
  attendedBefore: z.boolean(),
  applicationResponses: applicationResponsesSchema.default({}),
});

export type RegistrationFormValues = z.infer<typeof formSchema>;
export type ProfileFormValues = z.infer<typeof profileFormSchema>;
export type EventOnlyFormValues = z.infer<typeof eventOnlySchema>;

export type RegistrationSelectOption = { value: number; label: string };

export type RegistrationFormOptions = {
  genders: RegistrationSelectOption[];
  universities: RegistrationSelectOption[];
  majors: RegistrationSelectOption[];
  years: RegistrationSelectOption[];
  interests: RegistrationSelectOption[];
  dietary: RegistrationSelectOption[];
  heardFrom: RegistrationSelectOption[];
};
