import { describe, expect, test } from 'vitest';

import * as Rsvp from '@/lib/rsvp';

function row(statusLabel: string) {
  return {
    getValue: (columnId: string) => (columnId === 'status' ? statusLabel : undefined),
  };
}

describe('rsvpStatusFilterFn', () => {
  test('shows all rows when no statuses are selected', () => {
    expect(Rsvp.rsvpStatusFilterFn(row('pending'), 'status', undefined)).toBe(true);
    expect(Rsvp.rsvpStatusFilterFn(row('accepted'), 'status', [])).toBe(true);
  });

  test('keeps only the selected RSVP statuses', () => {
    expect(Rsvp.rsvpStatusFilterFn(row('accepted'), 'status', ['accepted'])).toBe(true);
    expect(Rsvp.rsvpStatusFilterFn(row('pending'), 'status', ['accepted'])).toBe(false);
    expect(Rsvp.rsvpStatusFilterFn(row('timed_out'), 'status', ['pending', 'timed_out'])).toBe(true);
    expect(Rsvp.rsvpStatusFilterFn(row('declined'), 'status', ['pending'])).toBe(false);
  });
});
