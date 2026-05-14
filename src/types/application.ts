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
  | 'boolean';

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
  options?: ApplicationQuestionOption[];
  order: number;
  active: boolean;
};
