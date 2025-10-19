import z from "zod";

export const personalSchema = z.object({
  fullName: z.string().trim().min(1, "Required"),
  attendedBefore: z.boolean(),
  gender: z.string().min(1, "Required"),
  university: z.string().min(1, "Required"),
  major: z.string().min(1, "Required"),
  yearOfStudy: z.string().min(1, "Required"),
});

export const interestsSchema = z.object({
  interests: z.array(z.string()).nonempty("Select at least one interest."),
  dietaryRestrictions: z.array(z.string()),
  accommodations: z.string().max(500).optional(),
});

export const consentsSchema = z.object({
  needsParking: z.boolean(),
  heardFrom: z.string().min(1, "Required"),
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
