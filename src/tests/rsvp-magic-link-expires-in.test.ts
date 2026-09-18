import { describe, expect, test } from 'vitest';

import { remainingMagicLinkExpiresInSeconds } from '@/lib/rsvp/rsvp-magic-link-expires-in';

describe('remainingMagicLinkExpiresInSeconds', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');

  test('covers a 48-hour RSVP window', () => {
    const respondBy = new Date('2026-09-18T12:00:00.000Z');
    expect(remainingMagicLinkExpiresInSeconds(respondBy, now)).toBe(
      48 * 60 * 60,
    );
  });

  test('covers a custom 24-hour RSVP window', () => {
    const respondBy = new Date('2026-09-17T12:00:00.000Z');
    expect(remainingMagicLinkExpiresInSeconds(respondBy, now)).toBe(
      24 * 60 * 60,
    );
  });

  test('covers a custom longer RSVP window', () => {
    const respondBy = new Date('2026-09-19T18:00:00.000Z');
    expect(remainingMagicLinkExpiresInSeconds(respondBy, now)).toBe(
      78 * 60 * 60,
    );
  });

  test('uses remaining time until respondBy after delayed processing', () => {
    const respondBy = new Date('2026-09-18T12:00:00.000Z');
    const processedAt = new Date('2026-09-16T18:00:00.000Z');
    expect(remainingMagicLinkExpiresInSeconds(respondBy, processedAt)).toBe(
      42 * 60 * 60,
    );
  });

  test('does not invent a fresh window once respondBy has passed', () => {
    const respondBy = new Date('2026-09-16T11:59:59.000Z');
    expect(remainingMagicLinkExpiresInSeconds(respondBy, now)).toBe(0);
  });

  test('ceils partial seconds so the link lasts through the deadline', () => {
    const respondBy = new Date(now.getTime() + 1500);
    expect(remainingMagicLinkExpiresInSeconds(respondBy, now)).toBe(2);
  });
});
