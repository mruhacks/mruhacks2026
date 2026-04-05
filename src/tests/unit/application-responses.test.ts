/**
 * Unit tests for application-responses helpers.
 * Pure functions — no database required.
 */

import { describe, test, expect } from 'vitest';
import {
  toResponseKeys,
  fromResponseKeys,
  buildApplicationResponses,
  RESPONSE_KEY_MAP,
} from '@/app/dashboard/events/application-responses';
import type { ApplicationQuestion } from '@/types/application';

// ---------------------------------------------------------------------------
// toResponseKeys
// ---------------------------------------------------------------------------

describe('toResponseKeys', () => {
  test('maps known camelCase fields to snake_case', () => {
    const result = toResponseKeys({
      attendedBefore: true,
      accommodations: 'wheelchair access',
      applicationResponses: {},
    });

    expect(result.attended_before).toBe(true);
    expect(result.accommodations).toBe('wheelchair access');
  });

  test('merges applicationResponses into the output', () => {
    const result = toResponseKeys({
      attendedBefore: false,
      accommodations: '',
      applicationResponses: {
        'q-123': 'Some answer',
        'q-456': 42,
      },
    });

    expect(result['q-123']).toBe('Some answer');
    expect(result['q-456']).toBe(42);
    expect(result.attended_before).toBe(false);
  });

  test('handles empty applicationResponses', () => {
    const result = toResponseKeys({
      attendedBefore: false,
      applicationResponses: {},
    });

    expect(result.attended_before).toBe(false);
    expect(Object.keys(result)).toContain('attended_before');
  });
});

// ---------------------------------------------------------------------------
// fromResponseKeys
// ---------------------------------------------------------------------------

describe('fromResponseKeys', () => {
  test('converts snake_case DB responses back to form shape', () => {
    const result = fromResponseKeys({
      attended_before: true,
      accommodations: 'dietary needs',
      'q-123': 'answer',
    });

    expect(result.attendedBefore).toBe(true);
    expect(result.accommodations).toBe('dietary needs');
    expect(result.applicationResponses['q-123']).toBe('answer');
  });

  test('defaults attendedBefore to false when missing', () => {
    const result = fromResponseKeys({});
    expect(result.attendedBefore).toBe(false);
    expect(result.accommodations).toBeUndefined();
  });

  test('preserves all responses in applicationResponses', () => {
    const responses = {
      attended_before: false,
      accommodations: '',
      'q-1': 'a',
      'q-2': 'b',
    };
    const result = fromResponseKeys(responses);
    expect(result.applicationResponses).toEqual(responses);
  });
});

// ---------------------------------------------------------------------------
// buildApplicationResponses
// ---------------------------------------------------------------------------

describe('buildApplicationResponses', () => {
  const makeQuestion = (
    overrides: Partial<ApplicationQuestion> & { id: string },
  ): ApplicationQuestion => ({
    label: 'Test Question',
    type: 'short_text',
    required: false,
    order: 1,
    active: true,
    ...overrides,
  });

  test('succeeds with no questions', () => {
    const result = buildApplicationResponses([], {
      attendedBefore: false,
      applicationResponses: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responses.attended_before).toBe(false);
    }
  });

  test('succeeds when required question has a value', () => {
    const questions = [
      makeQuestion({ id: 'q-1', label: 'Why attend?', required: true }),
    ];

    const result = buildApplicationResponses(questions, {
      attendedBefore: false,
      applicationResponses: { 'q-1': 'I love hackathons' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responses['q-1']).toBe('I love hackathons');
    }
  });

  test('fails when required question is missing', () => {
    const questions = [
      makeQuestion({ id: 'q-1', label: 'Why attend?', required: true }),
    ];

    const result = buildApplicationResponses(questions, {
      attendedBefore: false,
      applicationResponses: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Required');
      expect(result.error).toContain('Why attend?');
    }
  });

  test('fails when required question is empty string', () => {
    const questions = [
      makeQuestion({ id: 'q-1', label: 'Name', required: true }),
    ];

    const result = buildApplicationResponses(questions, {
      attendedBefore: false,
      applicationResponses: { 'q-1': '   ' },
    });

    expect(result.ok).toBe(false);
  });

  test('fails when required question is null', () => {
    const questions = [
      makeQuestion({ id: 'q-1', label: 'Name', required: true }),
    ];

    const result = buildApplicationResponses(questions, {
      attendedBefore: false,
      applicationResponses: { 'q-1': null },
    });

    expect(result.ok).toBe(false);
  });

  test('succeeds when optional question is missing', () => {
    const questions = [
      makeQuestion({ id: 'q-1', label: 'Optional', required: false }),
    ];

    const result = buildApplicationResponses(questions, {
      attendedBefore: false,
      applicationResponses: {},
    });

    expect(result.ok).toBe(true);
  });

  test('skips inactive questions even if required', () => {
    const questions = [
      makeQuestion({
        id: 'q-1',
        label: 'Old question',
        required: true,
        active: false,
      }),
    ];

    const result = buildApplicationResponses(questions, {
      attendedBefore: false,
      applicationResponses: {},
    });

    expect(result.ok).toBe(true);
  });

  test('validates multiple questions and fails on first missing required', () => {
    const questions = [
      makeQuestion({ id: 'q-1', label: 'First', required: false }),
      makeQuestion({ id: 'q-2', label: 'Second', required: true }),
      makeQuestion({ id: 'q-3', label: 'Third', required: true }),
    ];

    const result = buildApplicationResponses(questions, {
      attendedBefore: false,
      applicationResponses: { 'q-1': 'optional answer' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Second');
    }
  });

  test('handles boolean question values (false is valid)', () => {
    const questions = [
      makeQuestion({
        id: 'q-1',
        label: 'Agree?',
        type: 'boolean',
        required: true,
      }),
    ];

    const result = buildApplicationResponses(questions, {
      attendedBefore: false,
      applicationResponses: { 'q-1': false },
    });

    expect(result.ok).toBe(true);
  });

  test('handles number question values (0 is valid)', () => {
    const questions = [
      makeQuestion({
        id: 'q-1',
        label: 'Experience',
        type: 'number',
        required: true,
      }),
    ];

    const result = buildApplicationResponses(questions, {
      attendedBefore: false,
      applicationResponses: { 'q-1': 0 },
    });

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RESPONSE_KEY_MAP sanity
// ---------------------------------------------------------------------------

describe('RESPONSE_KEY_MAP', () => {
  test('contains expected mappings', () => {
    expect(RESPONSE_KEY_MAP.attendedBefore).toBe('attended_before');
    expect(RESPONSE_KEY_MAP.accommodations).toBe('accommodations');
  });
});
