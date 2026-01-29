/**
 * Pure helpers for event_applications.responses: key mapping (camelCase ↔ snake_case)
 * and building/validating the responses object. Used by server actions; no "use server".
 */

import type { EventOnlyFormValues } from "@/components/application-form/schema";
import type { ApplicationQuestion } from "@/types/application";

/**
 * Maps form (camelCase) keys to event_applications.responses (snake_case) keys.
 * Add any new mapped fields here so form and DB stay in sync.
 */
export const RESPONSE_KEY_MAP: Record<string, string> = {
  attendedBefore: "attended_before",
  accommodations: "accommodations",
};

/**
 * Builds the responses object for event_applications.responses from form data.
 * Maps known fields via RESPONSE_KEY_MAP and merges applicationResponses (question keys as-is).
 */
export function toResponseKeys(
  eventData: EventOnlyFormValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...eventData.applicationResponses };
  for (const [formKey, dbKey] of Object.entries(RESPONSE_KEY_MAP)) {
    const v = (eventData as Record<string, unknown>)[formKey];
    if (v !== undefined) out[dbKey] = v;
  }
  return out;
}

/**
 * Converts DB responses (snake_case) to form initial shape (camelCase) for pre-fill.
 */
export function fromResponseKeys(responses: Record<string, unknown>): {
  attendedBefore: boolean;
  accommodations: string | undefined;
  applicationResponses: Record<string, unknown>;
} {
  const attendedBefore =
    (responses[RESPONSE_KEY_MAP.attendedBefore] as boolean) ?? false;
  const accommodations = responses[RESPONSE_KEY_MAP.accommodations] as
    | string
    | undefined;
  return {
    attendedBefore,
    accommodations,
    applicationResponses: responses,
  };
}

export type BuildApplicationResponsesResult =
  | { ok: true; responses: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Builds the responses object for event_applications.responses from event form data.
 * Uses RESPONSE_KEY_MAP for known fields, merges applicationResponses, validates required questions.
 */
export function buildApplicationResponses(
  applicationQuestions: ApplicationQuestion[],
  eventData: EventOnlyFormValues,
): BuildApplicationResponsesResult {
  const responses = toResponseKeys(eventData);

  for (const q of applicationQuestions) {
    const value = responses[q.key];
    if (q.required) {
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "");
      if (empty) {
        return { ok: false, error: `Required: ${q.label ?? q.key}` };
      }
    }
  }

  return { ok: true, responses };
}
