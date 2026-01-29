import { z } from "zod";

/** Event-specific answers keyed by application question key. Validated in server action against event.applicationQuestions. */
export const applicationResponsesSchema = z.record(
  z.string(),
  z.unknown(),
);

/** Event-only form (for ApplicationForm): attendedBefore, accommodations, applicationResponses. */
export const eventOnlySchema = z.object({
  attendedBefore: z.boolean(),
  accommodations: z.string().max(500).optional(),
  applicationResponses: z.record(z.string(), z.unknown()).default({}),
});

export type EventOnlyFormValues = z.infer<typeof eventOnlySchema>;

export type ApplicationSelectOption = { value: number; label: string };

export type ApplicationFormOptions = {
  genders: ApplicationSelectOption[];
  universities: ApplicationSelectOption[];
  majors: ApplicationSelectOption[];
  years: ApplicationSelectOption[];
  interests: ApplicationSelectOption[];
  dietary: ApplicationSelectOption[];
  heardFrom: ApplicationSelectOption[];
};
