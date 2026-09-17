import { describe, expect, test } from 'vitest';

import { rsvpStatusFilterFn } from '@/lib/rsvp/rsvp-status-filter';

function row(statusLabel: string) {
  return {
    getValue: (columnId: string) =>
      columnId === 'status' ? statusLabel : undefined,
  };
}

describe('rsvpStatusFilterFn', () => {
  test('shows all rows when no statuses are selected', () => {
    expect(rsvpStatusFilterFn(row('pending'), 'status', undefined)).toBe(true);
    expect(rsvpStatusFilterFn(row('accepted'), 'status', [])).toBe(true);
  });

  test('keeps only the selected RSVP statuses', () => {
    expect(rsvpStatusFilterFn(row('accepted'), 'status', ['accepted'])).toBe(
      true,
    );
    expect(rsvpStatusFilterFn(row('pending'), 'status', ['accepted'])).toBe(
      false,
    );
    expect(
      rsvpStatusFilterFn(row('timed_out'), 'status', ['pending', 'timed_out']),
    ).toBe(true);
    expect(rsvpStatusFilterFn(row('declined'), 'status', ['pending'])).toBe(
      false,
    );
  });
});
