import { describe, test, expect } from 'vitest';
import {
  hasResponsesForOption,
  hasResponsesForQuestion,
  validateQuestionEdit,
} from '@/lib/question-diff';
import type { ApplicationQuestion } from '@/types/application';

function makeQuestion(
  overrides: Partial<ApplicationQuestion> = {},
): ApplicationQuestion {
  return {
    id: 'q1',
    label: 'Test Question',
    type: 'single_select',
    required: false,
    order: 0,
    active: true,
    options: [
      { value: 'opt-a', label: 'Option A', active: true },
      { value: 'opt-b', label: 'Option B', active: true },
    ],
    ...overrides,
  };
}

describe('hasResponsesForOption', () => {
  test('returns false for empty responses', () => {
    expect(hasResponsesForOption([], 'q1', 'opt-a')).toBe(false);
  });

  test('returns false when question has no answer', () => {
    const responses = [{ q2: 'opt-a' }];
    expect(hasResponsesForOption(responses, 'q1', 'opt-a')).toBe(false);
  });

  test('returns true for exact string match', () => {
    const responses = [{ q1: 'opt-a' }];
    expect(hasResponsesForOption(responses, 'q1', 'opt-a')).toBe(true);
  });

  test('returns false for different string value', () => {
    const responses = [{ q1: 'opt-b' }];
    expect(hasResponsesForOption(responses, 'q1', 'opt-a')).toBe(false);
  });

  test('returns true when value is in an array answer', () => {
    const responses = [{ q1: ['opt-a', 'opt-b'] }];
    expect(hasResponsesForOption(responses, 'q1', 'opt-a')).toBe(true);
  });

  test('returns false when value is not in an array answer', () => {
    const responses = [{ q1: ['opt-b', 'opt-c'] }];
    expect(hasResponsesForOption(responses, 'q1', 'opt-a')).toBe(false);
  });

  test('returns true if any response in the set matches', () => {
    const responses = [{ q1: 'opt-b' }, { q1: 'opt-a' }];
    expect(hasResponsesForOption(responses, 'q1', 'opt-a')).toBe(true);
  });
});

describe('hasResponsesForQuestion', () => {
  test('returns false for empty responses', () => {
    expect(hasResponsesForQuestion([], 'q1')).toBe(false);
  });

  test('returns false when question is not present in any response', () => {
    const responses = [{ q2: 'value' }];
    expect(hasResponsesForQuestion(responses, 'q1')).toBe(false);
  });

  test('returns false when question value is null', () => {
    const responses = [{ q1: null }];
    expect(hasResponsesForQuestion(responses, 'q1')).toBe(false);
  });

  test('returns false when question value is undefined', () => {
    const responses = [{ q1: undefined }];
    expect(hasResponsesForQuestion(responses, 'q1')).toBe(false);
  });

  test('returns true when question has a string value', () => {
    const responses = [{ q1: 'answer' }];
    expect(hasResponsesForQuestion(responses, 'q1')).toBe(true);
  });

  test('returns true when question has an array value', () => {
    const responses = [{ q1: ['a', 'b'] }];
    expect(hasResponsesForQuestion(responses, 'q1')).toBe(true);
  });

  test('returns true when question has a boolean value of false', () => {
    const responses = [{ q1: false }];
    expect(hasResponsesForQuestion(responses, 'q1')).toBe(true);
  });

  test('returns true if any response in the set has the question answered', () => {
    const responses = [{ q2: 'value' }, { q1: 'answer' }];
    expect(hasResponsesForQuestion(responses, 'q1')).toBe(true);
  });
});

describe('validateQuestionEdit', () => {
  describe('no existing responses', () => {
    const noResponses: Record<string, unknown>[] = [];

    test('updates label', () => {
      const q = makeQuestion();
      const result = validateQuestionEdit(
        q,
        { label: 'New Label' },
        noResponses,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.label).toBe('New Label');
    });

    test('updates required flag', () => {
      const q = makeQuestion({ required: false });
      const result = validateQuestionEdit(q, { required: true }, noResponses);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.required).toBe(true);
    });

    test('adds new options (no value = new)', () => {
      const q = makeQuestion({ options: [] });
      const result = validateQuestionEdit(
        q,
        { options: [{ label: 'Option X', active: true }] },
        noResponses,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.options).toHaveLength(1);
      expect(result.question.options![0].label).toBe('Option X');
      expect(result.question.options![0].value).toBeTruthy();
    });

    test('replaces all options when no responses exist', () => {
      const q = makeQuestion();
      const result = validateQuestionEdit(
        q,
        {
          options: [
            { value: 'opt-a', label: 'Option A Renamed', active: true },
            { label: 'Totally New', active: true },
          ],
        },
        noResponses,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.options).toHaveLength(2);
    });

    test('can clear all options when no responses exist', () => {
      const q = makeQuestion();
      const result = validateQuestionEdit(q, { options: [] }, noResponses);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.options).toHaveLength(0);
    });

    test('preserves unchanged fields', () => {
      const q = makeQuestion({ description: 'A helpful description' });
      const result = validateQuestionEdit(
        q,
        { label: 'New Label' },
        noResponses,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.description).toBe('A helpful description');
      expect(result.question.type).toBe('single_select');
    });

    test('patch with no fields returns unchanged question', () => {
      const q = makeQuestion();
      const result = validateQuestionEdit(q, {}, noResponses);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.label).toBe(q.label);
      expect(result.question.options).toEqual(q.options);
    });
  });

  describe('with existing responses', () => {
    const responses: Record<string, unknown>[] = [{ q1: 'opt-a' }];

    test('can rename an option label when it has responses', () => {
      const q = makeQuestion();
      const result = validateQuestionEdit(
        q,
        {
          options: [
            { value: 'opt-a', label: 'Option A Renamed', active: true },
            { value: 'opt-b', label: 'Option B', active: true },
          ],
        },
        responses,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.options![0].label).toBe('Option A Renamed');
    });

    test('can deactivate an option that has NO responses', () => {
      const q = makeQuestion();
      const result = validateQuestionEdit(
        q,
        {
          options: [
            { value: 'opt-a', label: 'Option A', active: true },
            { value: 'opt-b', label: 'Option B', active: false },
          ],
        },
        responses,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.options![1].active).toBe(false);
    });

    test('returns error when deactivating an option that HAS responses', () => {
      const q = makeQuestion();
      const result = validateQuestionEdit(
        q,
        {
          options: [
            { value: 'opt-a', label: 'Option A', active: false },
            { value: 'opt-b', label: 'Option B', active: true },
          ],
        },
        responses,
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected failure');
      expect(result.error).toContain('Option A');
    });

    test('returns error when omitting an option that HAS responses', () => {
      const q = makeQuestion();
      const result = validateQuestionEdit(
        q,
        {
          options: [{ value: 'opt-b', label: 'Option B', active: true }],
        },
        responses,
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected failure');
      expect(result.error).toContain('Option A');
    });

    test('returns error when referencing an unknown option value', () => {
      const q = makeQuestion();
      const result = validateQuestionEdit(
        q,
        {
          options: [
            { value: 'opt-a', label: 'Option A', active: true },
            { value: 'opt-b', label: 'Option B', active: true },
            { value: 'nonexistent', label: 'Ghost', active: true },
          ],
        },
        responses,
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected failure');
      expect(result.error).toContain('nonexistent');
    });

    test('can add a new option alongside existing ones with responses', () => {
      const q = makeQuestion();
      const result = validateQuestionEdit(
        q,
        {
          options: [
            { value: 'opt-a', label: 'Option A', active: true },
            { value: 'opt-b', label: 'Option B', active: true },
            { label: 'Brand New', active: true },
          ],
        },
        responses,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.options).toHaveLength(3);
      const newOpt = result.question.options!.find(
        (o) => o.label === 'Brand New',
      );
      expect(newOpt).toBeDefined();
      expect(newOpt!.value).toBeTruthy();
    });

    test('can omit an option with no responses when responses exist for other options', () => {
      const q = makeQuestion();
      // Only opt-a has a response; opt-b can be removed
      const result = validateQuestionEdit(
        q,
        {
          options: [{ value: 'opt-a', label: 'Option A', active: true }],
        },
        responses,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.question.options).toHaveLength(1);
    });
  });
});

describe('validateQuestionEdit — maxLength', () => {
  const base: ApplicationQuestion = {
    id: 'q1',
    label: 'Q1',
    type: 'short_text',
    required: true,
    order: 0,
    active: true,
  };

  test('an omitted patch leaves the existing cap alone', () => {
    const result = validateQuestionEdit({ ...base, maxLength: 40 }, {}, []);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.question.maxLength).toBe(40);
  });

  test('a number sets the cap', () => {
    const result = validateQuestionEdit(base, { maxLength: 120 }, []);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.question.maxLength).toBe(120);
  });

  test('null clears the cap back to the type default', () => {
    const result = validateQuestionEdit(
      { ...base, maxLength: 40 },
      { maxLength: null },
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.question.maxLength).toBeUndefined();
  });

  test('non-string questions never carry a cap', () => {
    const result = validateQuestionEdit(
      { ...base, type: 'single_select', options: [] },
      { maxLength: 120 },
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.question.maxLength).toBeUndefined();
  });
});
