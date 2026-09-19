import { describe, expect, test } from 'vitest';

import { getAttendeeRsvpCardDescription } from '@/app/dashboard/events/attendee-rsvp-copy';

describe('getAttendeeRsvpCardDescription', () => {
  test('pending asks the attendee to confirm attendance', () => {
    expect(getAttendeeRsvpCardDescription('pending', 'MRUHacks 2026')).toBe(
      'Your application was accepted. Please confirm whether you will attend.',
    );
  });

  test('accepted confirms the spot with the event name', () => {
    expect(getAttendeeRsvpCardDescription('accepted', 'MRUHacks 2026')).toBe(
      "Your spot is confirmed. We'll see you at MRUHacks 2026.",
    );
  });

  test('declined is a simple final state', () => {
    expect(getAttendeeRsvpCardDescription('declined', 'MRUHacks 2026')).toBe(
      'You declined your spot.',
    );
  });

  test('timed_out does not mention waves or processing', () => {
    expect(getAttendeeRsvpCardDescription('timed_out', 'MRUHacks 2026')).toBe(
      'Your RSVP window has ended.',
    );
  });
});
