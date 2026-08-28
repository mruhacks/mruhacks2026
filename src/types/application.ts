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
  /**
   * Whether this question's answer appears on the application review screen.
   * Unset defaults to shown — see `resolveShowInApplicationReview`.
   */
  showInApplicationReview?: boolean;
  /**
   * Whether this question's answers feed the aggregate stats/reports view.
   * Only meaningful for summarizable question types (see
   * `isSummarizableQuestion`); always ignored for free-text and section
   * dividers — see `resolveShowInReports`.
   */
  showInReports?: boolean;
  options?: ApplicationQuestionOption[];
  order: number;
  active: boolean;
};

/**
 * Default character caps applied to string-shaped questions when an admin has
 * not set an explicit `maxLength`. Kept here so the form UI, the client schema,
 * and the server-side response validator all agree on one number.
 */
export const DEFAULT_QUESTION_MAX_LENGTH: Record<
  'short_text' | 'long_text',
  number
> = {
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
 * True for question types with a closed, enumerable set of answers — the kind
 * that can be rolled up into counts/percentages for a stats view. Free text
 * and section dividers are excluded: free text has no fixed shape to
 * summarize, and dividers carry no answer at all.
 */
export function isSummarizableQuestion(
  type: ApplicationQuestionType,
): type is 'single_select' | 'multi_select' | 'number' | 'boolean' {
  return (
    type === 'single_select' ||
    type === 'multi_select' ||
    type === 'number' ||
    type === 'boolean'
  );
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

/**
 * Whether a question's answer should appear on the application review screen.
 * Unset (e.g. questions seeded before this flag existed) defaults to false.
 */
export function resolveShowInApplicationReview(
  question: Pick<ApplicationQuestion, 'showInApplicationReview'>,
): boolean {
  return question.showInApplicationReview ?? false;
}

/**
 * Whether a question's answers should feed the aggregate stats/reports view.
 * Always false for non-summarizable types (free text, section dividers),
 * regardless of the stored flag; unset otherwise defaults to false.
 */
export function resolveShowInReports(
  question: Pick<ApplicationQuestion, 'type' | 'showInReports'>,
): boolean {
  if (!isSummarizableQuestion(question.type)) return false;
  return question.showInReports ?? false;
}
