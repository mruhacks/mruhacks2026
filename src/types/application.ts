/**
 * Shared types and config for event application questions.
 * Used by events.applicationQuestions, registration form, and server actions.
 */

export type ApplicationQuestionType = "boolean" | "text" | "select";

export type ApplicationQuestionOption = {
  value: number | string;
  label: string;
};

export type ApplicationQuestion = {
  key: string;
  label?: string;
  type?: ApplicationQuestionType;
  required?: boolean;
  options?: ApplicationQuestionOption[];
};

/**
 * Maps application question keys to the options key returned by getOptions().
 * Used when rendering select questions that have no inline question.options.
 */
export const APPLICATION_QUESTION_OPTIONS_MAP: Record<string, string> = {
  heard_from_id: "heardFrom",
};
