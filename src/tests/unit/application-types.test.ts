/**
 * Unit tests for ApplicationQuestion types and constants.
 */

import { describe, test, expect } from 'vitest';
import {
  APPLICATION_QUESTION_TYPES,
  APPLICATION_QUESTION_OPTIONS_MAP,
  type ApplicationQuestion,
  type ApplicationQuestionType,
} from '@/types/application';

describe('APPLICATION_QUESTION_TYPES', () => {
  test('contains all six supported types', () => {
    const typeValues = APPLICATION_QUESTION_TYPES.map((t) => t.value);
    expect(typeValues).toContain('short_text');
    expect(typeValues).toContain('long_text');
    expect(typeValues).toContain('single_select');
    expect(typeValues).toContain('multi_select');
    expect(typeValues).toContain('number');
    expect(typeValues).toContain('boolean');
    expect(typeValues).toHaveLength(6);
  });

  test('each type has a human-readable label', () => {
    for (const type of APPLICATION_QUESTION_TYPES) {
      expect(type.label).toBeTruthy();
      expect(type.label.length).toBeGreaterThan(0);
    }
  });
});

describe('APPLICATION_QUESTION_OPTIONS_MAP', () => {
  test('maps heard_from_id to heardFrom', () => {
    expect(APPLICATION_QUESTION_OPTIONS_MAP.heard_from_id).toBe('heardFrom');
  });
});

describe('ApplicationQuestion type', () => {
  test('can construct a valid question object', () => {
    const question: ApplicationQuestion = {
      id: 'test-uuid',
      label: 'Test question',
      description: 'Help text',
      type: 'short_text',
      required: true,
      options: undefined,
      order: 1,
      active: true,
    };

    expect(question.id).toBe('test-uuid');
    expect(question.active).toBe(true);
    expect(question.order).toBe(1);
  });

  test('can construct a select question with options', () => {
    const question: ApplicationQuestion = {
      id: 'select-uuid',
      label: 'Pick one',
      type: 'single_select',
      required: false,
      options: [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' },
      ],
      order: 2,
      active: true,
    };

    expect(question.options).toHaveLength(2);
    expect(question.options![0].value).toBe('a');
  });

  test('description is optional', () => {
    const question: ApplicationQuestion = {
      id: 'no-desc',
      label: 'Simple',
      type: 'boolean',
      required: false,
      order: 1,
      active: true,
    };

    expect(question.description).toBeUndefined();
  });

  test('inactive question preserves all data', () => {
    const question: ApplicationQuestion = {
      id: 'inactive-uuid',
      label: 'Old question',
      type: 'long_text',
      required: true,
      order: 5,
      active: false,
    };

    expect(question.active).toBe(false);
    expect(question.label).toBe('Old question');
    expect(question.required).toBe(true);
  });

  const validTypes: ApplicationQuestionType[] = [
    'short_text',
    'long_text',
    'single_select',
    'multi_select',
    'number',
    'boolean',
  ];

  test.each(validTypes)('accepts type "%s"', (type) => {
    const question: ApplicationQuestion = {
      id: `type-${type}`,
      label: `Question of type ${type}`,
      type,
      required: false,
      order: 1,
      active: true,
    };

    expect(question.type).toBe(type);
  });
});
