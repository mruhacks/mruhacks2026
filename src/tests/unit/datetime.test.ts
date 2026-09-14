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
