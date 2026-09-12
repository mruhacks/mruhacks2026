import { describe, test, expect } from 'vitest';
import {
  ARTICLE_SLUG_MAX_LENGTH,
  isValidArticleSlug,
  slugifyArticleTitle,
  uniqueArticleSlug,
} from '@/lib/article-slug';

describe('slugifyArticleTitle', () => {
  test('lowercases and hyphenates words', () => {
    expect(slugifyArticleTitle('Getting Started')).toBe('getting-started');
  });

  test('collapses runs of punctuation and whitespace into one hyphen', () => {
    expect(slugifyArticleTitle('Wi-Fi   &&&  Power!!')).toBe('wi-fi-power');
  });

  test('strips leading and trailing separators', () => {
    expect(slugifyArticleTitle('  --Day 1--  ')).toBe('day-1');
  });

  test('folds accents rather than dropping the letter', () => {
    expect(slugifyArticleTitle('Café hours')).toBe('cafe-hours');
  });

  test('returns empty when nothing sluggable remains', () => {
    expect(slugifyArticleTitle('！？…')).toBe('');
  });

  test('truncates to the length budget without a trailing hyphen', () => {
    const title = `${'a'.repeat(ARTICLE_SLUG_MAX_LENGTH - 1)} tail`;
    const slug = slugifyArticleTitle(title);
    expect(slug.length).toBeLessThanOrEqual(ARTICLE_SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
    expect(isValidArticleSlug(slug)).toBe(true);
  });
});

describe('isValidArticleSlug', () => {
  test('accepts hyphen-separated alphanumerics', () => {
    expect(isValidArticleSlug('day-1-schedule')).toBe(true);
  });

  test.each([
    ['', 'empty'],
    ['-leading', 'leading hyphen'],
    ['trailing-', 'trailing hyphen'],
    ['double--hyphen', 'doubled hyphen'],
    ['Upper', 'uppercase'],
    ['has space', 'space'],
    ['slash/es', 'path separator'],
    ['a'.repeat(ARTICLE_SLUG_MAX_LENGTH + 1), 'over the length limit'],
  ])('rejects %s (%s)', (slug) => {
    expect(isValidArticleSlug(slug)).toBe(false);
  });
});

describe('uniqueArticleSlug', () => {
  test('returns the base when it is free', () => {
    expect(uniqueArticleSlug('schedule', ['faq'])).toBe('schedule');
  });

  test('appends the first free numeric suffix', () => {
    expect(uniqueArticleSlug('schedule', ['schedule', 'schedule-2'])).toBe(
      'schedule-3',
    );
  });

  test('keeps the suffixed slug inside the length budget and valid', () => {
    const base = 'a'.repeat(ARTICLE_SLUG_MAX_LENGTH);
    const result = uniqueArticleSlug(base, [base]);
    expect(result.length).toBeLessThanOrEqual(ARTICLE_SLUG_MAX_LENGTH);
    expect(isValidArticleSlug(result)).toBe(true);
  });

  test('does not leave a doubled hyphen when the trim lands on one', () => {
    const base = `${'ab-'.repeat(40)}c`.slice(0, ARTICLE_SLUG_MAX_LENGTH);
    const result = uniqueArticleSlug(base, [base]);
    expect(isValidArticleSlug(result)).toBe(true);
  });
});
