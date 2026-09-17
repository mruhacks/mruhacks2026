import { describe, expect, test } from 'vitest';

import {
  formatLiveCountdown,
  formatRemaining,
} from '@/lib/rsvp/format-remaining';

describe('formatRemaining', () => {
  const now = new Date('2026-03-01T12:00:00.000Z');

  test('returns null when the deadline has passed', () => {
    expect(formatRemaining(new Date('2026-03-01T11:59:00.000Z'), now)).toBe(
      null,
    );
  });

  test('formats minutes when under an hour', () => {
    expect(formatRemaining(new Date('2026-03-01T12:20:00.000Z'), now)).toBe(
      '20m',
    );
  });

  test('formats hours and minutes under 48 hours', () => {
    expect(formatRemaining(new Date('2026-03-02T19:15:00.000Z'), now)).toBe(
      '31h 15m',
    );
  });

  test('formats whole days at 48 hours or more', () => {
    expect(formatRemaining(new Date('2026-03-04T12:00:00.000Z'), now)).toBe(
      '3 days',
    );
  });
});

describe('formatLiveCountdown', () => {
  const now = new Date('2026-03-01T12:00:00.000Z');

  test('returns null when the deadline has passed', () => {
    expect(
      formatLiveCountdown(new Date('2026-03-01T11:59:59.000Z'), now),
    ).toBeNull();
  });

  test('formats hours and minutes under 24 hours', () => {
    expect(formatLiveCountdown(new Date('2026-03-02T10:18:00.000Z'), now)).toBe(
      '22h 18m',
    );
  });

  test('includes days when at least 24 hours remain', () => {
    expect(formatLiveCountdown(new Date('2026-03-03T10:18:00.000Z'), now)).toBe(
      '1d 22h 18m',
    );
  });

  test('formats minutes when under an hour', () => {
    expect(formatLiveCountdown(new Date('2026-03-01T12:18:00.000Z'), now)).toBe(
      '18m',
    );
  });
});
