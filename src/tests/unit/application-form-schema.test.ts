import { describe, test, expect } from 'vitest';
import { createApplicationFormSchema } from '@/components/application-form/schema';
import type { ApplicationQuestion } from '@/types/application';

function q(overrides: Partial<ApplicationQuestion>): ApplicationQuestion {
  return {
    id: overrides.id ?? 'q1',
    type: overrides.type ?? 'short_text',
    label: overrides.label ?? 'Question',
    required: overrides.required ?? true,
    active: overrides.active ?? true,
    options: overrides.options ?? [],
    ...overrides,
  } as ApplicationQuestion;
}

describe('createApplicationFormSchema', () => {
  test('returns permissive schema when questions is null', () => {
    const schema = createApplicationFormSchema(null);
    expect(schema.safeParse({ applicationResponses: {} }).success).toBe(true);
    expect(schema.safeParse({ applicationResponses: { anything: 42 } }).success).toBe(true);
  });

  test('skips inactive questions', () => {
    const schema = createApplicationFormSchema([q({ id: 'q1', active: false, required: true })]);
    // inactive → not validated → unknown key is fine
    expect(schema.safeParse({ applicationResponses: {} }).success).toBe(true);
  });

  test('skips section_divider questions', () => {
    const schema = createApplicationFormSchema([q({ id: 'q1', type: 'section_divider' })]);
    expect(schema.safeParse({ applicationResponses: {} }).success).toBe(true);
  });

  describe('short_text / long_text', () => {
    test('required field rejects empty string', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'short_text', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: '' } }).success).toBe(false);
    });

    test('required field accepts non-empty string', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'short_text', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: 'hello' } }).success).toBe(true);
    });

    test('optional field accepts null', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'long_text', required: false })]);
      expect(schema.safeParse({ applicationResponses: { q1: null } }).success).toBe(true);
    });
  });

  describe('number', () => {
    test('accepts a numeric value', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'number', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: 42 } }).success).toBe(true);
    });

    test('accepts a numeric string via coerce', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'number', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: '7' } }).success).toBe(true);
    });

    test('rejects a non-numeric string', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'number', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: 'abc' } }).success).toBe(false);
    });
  });

  describe('boolean', () => {
    test('required boolean rejects false', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'boolean', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: false } }).success).toBe(false);
    });

    test('required boolean accepts true', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'boolean', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: true } }).success).toBe(true);
    });

    test('optional boolean accepts null', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'boolean', required: false })]);
      expect(schema.safeParse({ applicationResponses: { q1: null } }).success).toBe(true);
    });
  });

  describe('single_select', () => {
    test('required field rejects empty string', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'single_select', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: '' } }).success).toBe(false);
    });

    test('required field accepts a non-empty selection', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'single_select', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: 'option-a' } }).success).toBe(true);
    });

    test('includes an other_text companion field', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'single_select', required: true })]);
      const result = schema.safeParse({ applicationResponses: { q1: 'Other', 'q1__other': 'custom' } });
      expect(result.success).toBe(true);
    });
  });

  describe('multi_select', () => {
    test('required field rejects empty array', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'multi_select', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: [] } }).success).toBe(false);
    });

    test('required field accepts non-empty array', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'multi_select', required: true })]);
      expect(schema.safeParse({ applicationResponses: { q1: ['a', 'b'] } }).success).toBe(true);
    });

    test('includes an other_text companion field', () => {
      const schema = createApplicationFormSchema([q({ id: 'q1', type: 'multi_select', required: true })]);
      const result = schema.safeParse({ applicationResponses: { q1: ['Other'], 'q1__other': 'custom value' } });
      expect(result.success).toBe(true);
    });
  });

  test('unknown question type falls back to z.unknown() and passes any value', () => {
    // Cast to bypass TS — tests the default branch in the switch.
    const schema = createApplicationFormSchema([q({ id: 'q1', type: 'unknown_future_type' as never, required: true })]);
    expect(schema.safeParse({ applicationResponses: { q1: 'anything' } }).success).toBe(true);
  });

  test('applicationResponses defaults to empty object when omitted', () => {
    const schema = createApplicationFormSchema([]);
    expect(schema.safeParse({}).success).toBe(true);
  });
});
