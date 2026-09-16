import { describe, expect, test } from 'vitest';

import { formatEventDateTime, parseInstant } from '@/lib/datetime';

describe('parseInstant', () => {
  test('treats a naive ISO datetime as UTC', () => {
    const date = parseInstant('2026-09-14T22:31:00.000');
    expect(date?.toISOString()).toBe('2026-09-14T22:31:00.000Z');
  });

  test('treats a postgres-style naive timestamp as UTC', () => {
    const date = parseInstant('2026-09-14 22:31:00.000');
    expect(date?.toISOString()).toBe('2026-09-14T22:31:00.000Z');
  });

  test('keeps an offset ISO datetime as that instant', () => {
    const date = parseInstant('2026-09-14T16:31:00.000-06:00');
    expect(date?.toISOString()).toBe('2026-09-14T22:31:00.000Z');
  });

  test('keeps a Zulu ISO datetime as that instant', () => {
    const date = parseInstant('2026-09-14T22:31:00.000Z');
    expect(date?.toISOString()).toBe('2026-09-14T22:31:00.000Z');
  });

  test('keeps the hour-only offset postgres emits as that instant', () => {
    // `+00` is what a `timestamptz` column serializes to. It is not a legal
    // ISO offset, so it has to be padded before the strict parser sees it.
    expect(parseInstant('2026-09-14 22:31:00+00')?.toISOString()).toBe(
      '2026-09-14T22:31:00.000Z',
    );
    expect(parseInstant('2026-09-14 16:31:00-06')?.toISOString()).toBe(
      '2026-09-14T22:31:00.000Z',
    );
  });

  test('keeps a colon-less offset as that instant', () => {
    expect(parseInstant('2026-09-14T16:31:00.000-0600')?.toISOString()).toBe(
      '2026-09-14T22:31:00.000Z',
    );
  });

  test('keeps sub-second precision beyond milliseconds', () => {
    expect(parseInstant('2026-09-14 22:31:00.123456+00')?.toISOString()).toBe(
      '2026-09-14T22:31:00.123Z',
    );
  });

  test('passes through a valid Date', () => {
    const input = new Date('2026-09-14T22:31:00.000Z');
    expect(parseInstant(input)).toBe(input);
  });

  test('returns null for empty or invalid values', () => {
    expect(parseInstant(null)).toBeNull();
    expect(parseInstant('')).toBeNull();
    expect(parseInstant('not a date')).toBeNull();
    expect(parseInstant(new Date('invalid'))).toBeNull();
  });
});

describe('formatEventDateTime', () => {
  test('prints America/Edmonton wall clock with a zone abbreviation', () => {
    const date = parseInstant('2026-09-14T22:31:00.000Z')!;
    expect(formatEventDateTime(date)).toMatch(/Sep 14, 2026, 4:31\sPM MDT/);
  });
});
