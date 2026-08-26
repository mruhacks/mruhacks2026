/**
 * Shared types and config for event application questions.
 * Used by events.applicationQuestions, application form, and server actions.
 */

export type ApplicationQuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_select'
  | 'multi_select'
  | 'number'
  | 'boolean'
  | 'section_divider';

export type ApplicationQuestionOption = {
  value: string;
  label: string;
  active: boolean;
};

export type ApplicationQuestion = {
  id: string;
  label: string;
  description?: string;
  type: ApplicationQuestionType;
  required: boolean;
  /**
   * Character cap for `short_text` / `long_text` answers. Unset falls back to
   * `DEFAULT_QUESTION_MAX_LENGTH`; ignored for every other question type.
   */
  maxLength?: number;
  options?: ApplicationQuestionOption[];
  order: number;
  active: boolean;
};

/**
 * Default character caps applied to string-shaped questions when an admin has
 * not set an explicit `maxLength`. Kept here so the form UI, the client schema,
 * and the server-side response validator all agree on one number.
 */
export const DEFAULT_QUESTION_MAX_LENGTH: Record<'short_text' | 'long_text', number> = {
  short_text: 255,
  long_text: 2000,
};

/** Upper bound an admin may configure, so a typo can't uncap the column. */
export const QUESTION_MAX_LENGTH_LIMIT = 10000;

/** True for question types whose answer is free text and therefore capped. */
export function isStringQuestion(
  type: ApplicationQuestionType,
): type is 'short_text' | 'long_text' {
  return type === 'short_text' || type === 'long_text';
}

/**
 * Effective character cap for a question: the admin-configured `maxLength` when
 * present, otherwise the type default. Returns null for non-string questions.
 */
export function resolveMaxLength(
  question: Pick<ApplicationQuestion, 'type' | 'maxLength'>,
): number | null {
  if (!isStringQuestion(question.type)) return null;
  return question.maxLength ?? DEFAULT_QUESTION_MAX_LENGTH[question.type];
}
