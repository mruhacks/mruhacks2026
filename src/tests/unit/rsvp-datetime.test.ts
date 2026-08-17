import { describe, expect, test } from 'vitest';

import { EVENT_TIMEZONE } from '@/content';
import { resolveEffectiveRsvpStatus } from '@/lib/rsvp/effective-rsvp-status';
import { buildRsvpInvitationEmail } from '@/lib/rsvp/rsvp-invitation-email';
import {
  formatRsvpDateTime,
  formatRsvpDeadline,
  parseDateTimeLocalInTimeZone,
  parseRsvpDeadline,
} from '@/lib/rsvp/rsvp-datetime';

describe('parseRsvpDeadline', () => {
  test('datetime-local in Mountain Daylight converts to the UTC instant', () => {
    // 23:59 on 20 Aug 2026 in Calgary is UTC-6 (MDT).
    const stored = parseRsvpDeadline('2026-08-20T23:59');
    expect(stored.toISOString()).toBe('2026-08-21T05:59:00.000Z');
  });

  test('datetime-local in Mountain Standard converts to the UTC instant', () => {
    // 23:59 on 1 Dec 2026 in Calgary is UTC-7 (MST).
    const stored = parseDateTimeLocalInTimeZone(
      '2026-12-01T23:59',
      EVENT_TIMEZONE,
    );
    expect(stored.toISOString()).toBe('2026-12-02T06:59:00.000Z');
  });

  test('ISO strings with an explicit offset stay absolute', () => {
    const stored = parseRsvpDeadline('2026-08-21T05:59:00.000Z');
    expect(stored.toISOString()).toBe('2026-08-21T05:59:00.000Z');
  });

  test('datetime-local is interpreted in EVENT_TIMEZONE, not as UTC', () => {
    const stored = parseDateTimeLocalInTimeZone(
      '2026-08-20T23:59',
      EVENT_TIMEZONE,
    );
    const asUtc = new Date('2026-08-20T23:59:00.000Z');
    const asNewYork = parseDateTimeLocalInTimeZone(
      '2026-08-20T23:59',
      'America/New_York',
    );
    expect(stored.toISOString()).toBe('2026-08-21T05:59:00.000Z');
    expect(stored.getTime()).not.toBe(asUtc.getTime());
    expect(stored.getTime()).not.toBe(asNewYork.getTime());
  });
});

describe('deadline comparison', () => {
  test('expires at the stored instant, not at a server-local wall clock', () => {
    const deadline = parseRsvpDeadline('2026-08-20T23:59');

    const stillOpen = new Date('2026-08-21T05:58:59.000Z');
    expect(
      resolveEffectiveRsvpStatus('pending', deadline, stillOpen),
    ).toBe('pending');

    const justExpired = new Date('2026-08-21T05:59:00.001Z');
    expect(
      resolveEffectiveRsvpStatus('pending', deadline, justExpired),
    ).toBe('timed_out');
  });
});

describe('RSVP deadline formatting', () => {
  const instant = new Date('2026-08-21T05:59:00.000Z');

  test('email deadline matches the intended Calgary local time and includes a zone', () => {
    const formatted = formatRsvpDeadline(instant);
    expect(formatted).toMatch(/August 20, 2026/i);
    expect(formatted).toMatch(/11:59/i);
    expect(formatted).toMatch(/MDT|MST|GMT-6|UTC-6/i);

    const email = buildRsvpInvitationEmail({
      eventName: 'MRUHacks',
      respondBy: instant,
      magicLinkUrl: 'https://example.com/rsvp',
    });
    expect(email.text).toContain(formatted);
    expect(email.html).toContain(formatted);
  });

  test('UI formatting uses the same Calgary instant', () => {
    const formatted = formatRsvpDateTime(instant);
    expect(formatted).toMatch(/Aug(ust)?\.? 20, 2026/i);
    expect(formatted).toMatch(/11:59/i);
    expect(formatted).toMatch(/MDT|MST|GMT-6|UTC-6/i);
  });

  test('formatting does not depend on the server process timezone', () => {
    const calgary = formatRsvpDeadline(instant, EVENT_TIMEZONE);
    const tokyo = formatRsvpDeadline(instant, 'Asia/Tokyo');
    expect(calgary).toBe(formatRsvpDeadline(instant));
    expect(calgary).not.toBe(tokyo);
    expect(calgary).toMatch(/MDT|MST|GMT-6|UTC-6/i);
    expect(tokyo).toMatch(/JST|GMT\+9|UTC\+9/i);
  });
});
