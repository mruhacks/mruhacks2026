import { z } from "zod";

export const personalSchema = z.object({
  fullName: z.string().trim().min(1, "Required"),
  attendedBefore: z.boolean(),
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

export const consentsSchema = z.object({
  needsParking: z.boolean(),
  heardFromId: z.number("Required"),
  consentInfoUse: z
    .boolean()
    .refine((v) => v === true, { message: "Required" }),
  consentSponsorShare: z
    .boolean()
    .refine((v) => v === true, { message: "Required" }),
  consentMediaUse: z
    .boolean()
    .refine((v) => v === true, { message: "Required" }),
});

export const formSchema = z.object({
  ...personalSchema.shape,
  ...interestsSchema.shape,
  ...consentsSchema.shape,
});

export type RegistrationFormValues = z.infer<typeof formSchema>;

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
