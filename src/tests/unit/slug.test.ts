import { describe, test, expect } from 'vitest';
import { SLUG_MAX_LENGTH, isValidSlug, slugify, uniqueSlug } from '@/lib/slug';

describe('slugify', () => {
  test('lowercases and hyphenates words', () => {
    expect(slugify('Getting Started')).toBe('getting-started');
  });

  test('collapses runs of punctuation and whitespace into one hyphen', () => {
    expect(slugify('Wi-Fi   &&&  Power!!')).toBe('wi-fi-power');
  });

  test('strips leading and trailing separators', () => {
    expect(slugify('  --Day 1--  ')).toBe('day-1');
  });

  test('folds accents rather than dropping the letter', () => {
    expect(slugify('Café hours')).toBe('cafe-hours');
  });

  test('returns empty when nothing sluggable remains', () => {
    expect(slugify('！？…')).toBe('');
  });

  test('truncates to the length budget without a trailing hyphen', () => {
    const title = `${'a'.repeat(SLUG_MAX_LENGTH - 1)} tail`;
    const slug = slugify(title);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
    expect(isValidSlug(slug)).toBe(true);
  });
});

describe('isValidSlug', () => {
  test('accepts hyphen-separated alphanumerics', () => {
    expect(isValidSlug('day-1-schedule')).toBe(true);
  });

  test.each([
    ['', 'empty'],
    ['-leading', 'leading hyphen'],
    ['trailing-', 'trailing hyphen'],
    ['double--hyphen', 'doubled hyphen'],
    ['Upper', 'uppercase'],
    ['has space', 'space'],
    ['slash/es', 'path separator'],
    ['a'.repeat(SLUG_MAX_LENGTH + 1), 'over the length limit'],
  ])('rejects %s (%s)', (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });
});

describe('uniqueSlug', () => {
  test('returns the base when it is free', () => {
    expect(uniqueSlug('schedule', ['faq'])).toBe('schedule');
  });

  test('appends the first free numeric suffix', () => {
    expect(uniqueSlug('schedule', ['schedule', 'schedule-2'])).toBe(
      'schedule-3',
    );
  });

  test('keeps the suffixed slug inside the length budget and valid', () => {
    const base = 'a'.repeat(SLUG_MAX_LENGTH);
    const result = uniqueSlug(base, [base]);
    expect(result.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(isValidSlug(result)).toBe(true);
  });

  test('does not leave a doubled hyphen when the trim lands on one', () => {
    const base = `${'ab-'.repeat(40)}c`.slice(0, SLUG_MAX_LENGTH);
    const result = uniqueSlug(base, [base]);
    expect(isValidSlug(result)).toBe(true);
  });
});
