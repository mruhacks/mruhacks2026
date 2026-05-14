import { z } from 'zod';

/** Event-specific answers keyed by question UUID. Validated server-side against event.applicationQuestions. */
export const applicationResponsesSchema = z.record(z.string(), z.unknown());

/** Event-only form: applicationResponses keyed by question UUID. */
export const eventOnlySchema = z.object({
  applicationResponses: z.record(z.string(), z.unknown()).default({}),
});

export type EventOnlyFormValues = z.infer<typeof eventOnlySchema>;

export type ApplicationSelectOption = { value: string; label: string };
