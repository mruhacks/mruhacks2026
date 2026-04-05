/**
 * Shared types and config for event application questions.
 * Used by events.applicationQuestions, application form, form builder, and server actions.
 */

/**
 * Supported question types for the form builder.
 * - short_text: Single-line text input
 * - long_text: Multi-line textarea
 * - single_select: Dropdown / radio (pick one)
 * - multi_select: Checkboxes (pick many)
 * - number: Numeric input
 * - boolean: Checkbox (yes/no)
 */
export type ApplicationQuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_select'
  | 'multi_select'
  | 'number'
  | 'boolean';

export const APPLICATION_QUESTION_TYPES: {
  value: ApplicationQuestionType;
  label: string;
}[] = [
  { value: 'short_text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text' },
  { value: 'single_select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes / No' },
];

export type ApplicationQuestionOption = {
  value: string;
  label: string;
};

export type ApplicationQuestion = {
  /** Stable UUID identifier for the question */
  id: string;
  /** Display label shown to applicants */
  label: string;
  /** Optional help text / description */
  description?: string;
  /** Input type */
  type: ApplicationQuestionType;
  /** Whether an answer is required for submission */
  required: boolean;
  /** Options for single_select / multi_select types */
  options?: ApplicationQuestionOption[];
  /** Sort order (ascending) */
  order: number;
  /** Soft-delete flag; inactive questions are hidden but preserved for historical data */
  active: boolean;
};

/**
 * Maps application question keys to the options key returned by getOptions().
 * Used when rendering select questions that have no inline question.options.
 */
export const APPLICATION_QUESTION_OPTIONS_MAP: Record<string, string> = {
  heard_from_id: 'heardFrom',
};
