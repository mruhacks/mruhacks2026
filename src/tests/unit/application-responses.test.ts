import { describe, test, expect } from 'vitest';
import { buildApplicationResponses } from '@/app/dashboard/events/application-responses';
import type { ApplicationQuestion } from '@/types/application';

function q(overrides: Partial<ApplicationQuestion> & Pick<ApplicationQuestion, 'id' | 'type' | 'label'>): ApplicationQuestion {
  return { required: false, order: 0, active: true, ...overrides };
}

describe('buildApplicationResponses', () => {
  test('empty questions returns empty responses', () => {
    const result = buildApplicationResponses([], {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.responses).toEqual({});
  });

  test('inactive questions are skipped', () => {
    const questions = [q({ id: 'q1', type: 'short_text', label: 'Q1', active: false, required: true })];
    const result = buildApplicationResponses(questions, {});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.responses).toEqual({});
  });

  test('section_divider questions are always skipped', () => {
    const questions = [q({ id: 'q1', type: 'section_divider', label: 'Section' })];
    const result = buildApplicationResponses(questions, { q1: 'anything' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect('q1' in result.responses).toBe(false);
  });

  describe('short_text', () => {
    test('required, valid string passes', () => {
      const questions = [q({ id: 'q1', type: 'short_text', label: 'Name', required: true })];
      const result = buildApplicationResponses(questions, { q1: 'Alice' });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.responses['q1']).toBe('Alice');
    });

    test('required, empty string fails', () => {
      const questions = [q({ id: 'q1', type: 'short_text', label: 'Name', required: true })];
      const result = buildApplicationResponses(questions, { q1: '' });
      expect(result.ok).toBe(false);
    });

    test('required, missing value fails', () => {
      const questions = [q({ id: 'q1', type: 'short_text', label: 'Name', required: true })];
      const result = buildApplicationResponses(questions, {});
      expect(result.ok).toBe(false);
    });

    test('optional, undefined value is excluded from response', () => {
      const questions = [q({ id: 'q1', type: 'short_text', label: 'Name', required: false })];
      const result = buildApplicationResponses(questions, {});
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect('q1' in result.responses).toBe(false);
    });
  });

  describe('long_text', () => {
    test('required, valid string passes', () => {
      const questions = [q({ id: 'q1', type: 'long_text', label: 'Bio', required: true })];
      const result = buildApplicationResponses(questions, { q1: 'I love hackathons.' });
      expect(result.ok).toBe(true);
    });

    test('required, empty string fails', () => {
      const questions = [q({ id: 'q1', type: 'long_text', label: 'Bio', required: true })];
      const result = buildApplicationResponses(questions, { q1: '   ' });
      expect(result.ok).toBe(false);
    });
  });

  describe('number', () => {
    test('required, numeric value passes', () => {
      const questions = [q({ id: 'q1', type: 'number', label: 'Age', required: true })];
      const result = buildApplicationResponses(questions, { q1: 21 });
      expect(result.ok).toBe(true);
    });

    test('required, numeric string is coerced to number', () => {
      const questions = [q({ id: 'q1', type: 'number', label: 'Age', required: true })];
      const result = buildApplicationResponses(questions, { q1: '21' });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.responses['q1']).toBe(21);
    });

    test('required, non-numeric string fails', () => {
      const questions = [q({ id: 'q1', type: 'number', label: 'Age', required: true })];
      const result = buildApplicationResponses(questions, { q1: 'abc' });
      expect(result.ok).toBe(false);
    });
  });

  describe('boolean', () => {
    test('required boolean must be true (consent)', () => {
      const questions = [q({ id: 'q1', type: 'boolean', label: 'Consent', required: true })];
      const result = buildApplicationResponses(questions, { q1: true });
      expect(result.ok).toBe(true);
    });

    test('required boolean with false value fails', () => {
      const questions = [q({ id: 'q1', type: 'boolean', label: 'Consent', required: true })];
      const result = buildApplicationResponses(questions, { q1: false });
      expect(result.ok).toBe(false);
    });

    test('optional boolean with false is allowed', () => {
      const questions = [q({ id: 'q1', type: 'boolean', label: 'Subscribe', required: false })];
      const result = buildApplicationResponses(questions, { q1: false });
      expect(result.ok).toBe(true);
    });
  });

  describe('single_select', () => {
    test('required, valid option passes', () => {
      const questions = [q({ id: 'q1', type: 'single_select', label: 'T-Shirt', required: true })];
      const result = buildApplicationResponses(questions, { q1: 'medium' });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.responses['q1']).toBe('medium');
    });

    test('required, empty string fails', () => {
      const questions = [q({ id: 'q1', type: 'single_select', label: 'T-Shirt', required: true })];
      const result = buildApplicationResponses(questions, { q1: '' });
      expect(result.ok).toBe(false);
    });
  });

  describe('multi_select', () => {
    test('required, non-empty array passes', () => {
      const questions = [q({ id: 'q1', type: 'multi_select', label: 'Skills', required: true })];
      const result = buildApplicationResponses(questions, { q1: ['js', 'python'] });
      expect(result.ok).toBe(true);
    });

    test('required, empty array fails', () => {
      const questions = [q({ id: 'q1', type: 'multi_select', label: 'Skills', required: true })];
      const result = buildApplicationResponses(questions, { q1: [] });
      expect(result.ok).toBe(false);
    });
  });

  test('error message includes the question label', () => {
    const questions = [q({ id: 'q1', type: 'short_text', label: 'Your Hometown', required: true })];
    const result = buildApplicationResponses(questions, { q1: '' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('Your Hometown');
  });

  test('null values are excluded from responses', () => {
    const questions = [q({ id: 'q1', type: 'short_text', label: 'Optional', required: false })];
    const result = buildApplicationResponses(questions, { q1: null });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect('q1' in result.responses).toBe(false);
  });

  test('first failing question stops processing and returns its error', () => {
    const questions = [
      q({ id: 'q1', type: 'short_text', label: 'First', required: true }),
      q({ id: 'q2', type: 'short_text', label: 'Second', required: true }),
    ];
    const result = buildApplicationResponses(questions, { q1: '', q2: 'valid' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('First');
    expect(result.error).not.toContain('Second');
  });

  test('multiple valid questions all included in response', () => {
    const questions = [
      q({ id: 'q1', type: 'short_text', label: 'Name', required: true }),
      q({ id: 'q2', type: 'number', label: 'Age', required: true }),
      q({ id: 'q3', type: 'boolean', label: 'Subscribe', required: false }),
    ];
    const result = buildApplicationResponses(questions, { q1: 'Alice', q2: 22, q3: false });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.responses['q1']).toBe('Alice');
    expect(result.responses['q2']).toBe(22);
  });

  describe('"Other" option free text', () => {
    const options = [
      { value: 'js', label: 'JavaScript', active: true },
      { value: 'other', label: 'Other', active: true },
    ];

    test('single_select: non-other selection ignores the companion text', () => {
      const questions = [
        q({ id: 'q1', type: 'single_select', label: 'Skills', required: true, options }),
      ];
      const result = buildApplicationResponses(questions, {
        q1: 'js',
        q1__other: 'ignored',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect('q1__other' in result.responses).toBe(false);
    });

    test('single_select: other selection includes valid companion text', () => {
      const questions = [
        q({ id: 'q1', type: 'single_select', label: 'Skills', required: true, options }),
      ];
      const result = buildApplicationResponses(questions, {
        q1: 'other',
        q1__other: 'Rust',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.responses['q1__other']).toBe('Rust');
    });

    test('single_select: other selection with too-long companion text fails', () => {
      const questions = [
        q({ id: 'q1', type: 'single_select', label: 'Skills', required: true, options }),
      ];
      const result = buildApplicationResponses(questions, {
        q1: 'other',
        q1__other: 'x'.repeat(256),
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected failure');
      expect(result.error).toContain('Skills');
    });

    test('multi_select: other included among selections includes companion text', () => {
      const questions = [
        q({ id: 'q1', type: 'multi_select', label: 'Skills', required: true, options }),
      ];
      const result = buildApplicationResponses(questions, {
        q1: ['js', 'other'],
        q1__other: 'Zig',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.responses['q1__other']).toBe('Zig');
    });

    test('multi_select: other not selected excludes companion text', () => {
      const questions = [
        q({ id: 'q1', type: 'multi_select', label: 'Skills', required: true, options }),
      ];
      const result = buildApplicationResponses(questions, {
        q1: ['js'],
        q1__other: 'ignored',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect('q1__other' in result.responses).toBe(false);
    });
  });
});

describe('buildApplicationResponses — max length', () => {
  test('rejects a short_text answer past the 255-character default', () => {
    const questions = [q({ id: 'q1', type: 'short_text', label: 'Q1', required: true })];
    expect(buildApplicationResponses(questions, { q1: 'a'.repeat(255) }).ok).toBe(true);

    const result = buildApplicationResponses(questions, { q1: 'a'.repeat(256) });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.error).toContain('255');
  });

  test('rejects a long_text answer past the 2000-character default', () => {
    const questions = [q({ id: 'q1', type: 'long_text', label: 'Q1', required: true })];
    expect(buildApplicationResponses(questions, { q1: 'a'.repeat(2000) }).ok).toBe(true);
    expect(buildApplicationResponses(questions, { q1: 'a'.repeat(2001) }).ok).toBe(false);
  });

  test('honours a configured maxLength over the type default', () => {
    const questions = [
      q({ id: 'q1', type: 'short_text', label: 'Q1', required: true, maxLength: 10 }),
    ];
    expect(buildApplicationResponses(questions, { q1: 'a'.repeat(10) }).ok).toBe(true);
    expect(buildApplicationResponses(questions, { q1: 'a'.repeat(11) }).ok).toBe(false);
  });

  test('a configured maxLength can raise the cap above the default', () => {
    const questions = [
      q({ id: 'q1', type: 'short_text', label: 'Q1', required: true, maxLength: 500 }),
    ];
    expect(buildApplicationResponses(questions, { q1: 'a'.repeat(400) }).ok).toBe(true);
  });

  test('the cap is applied after trimming', () => {
    const questions = [
      q({ id: 'q1', type: 'short_text', label: 'Q1', required: true, maxLength: 5 }),
    ];
    const result = buildApplicationResponses(questions, { q1: '   abcde   ' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.responses.q1).toBe('abcde');
  });
});
