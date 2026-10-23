import { describe, expect, test } from 'vitest';

import * as Rsvp from '@/lib/rsvp';

function row(statusLabel: string) {
  return {
    getValue: (columnId: string) => (columnId === 'status' ? statusLabel : undefined),
  };
}

describe('statusFilterFn', () => {
  test('shows all rows when no statuses are selected', () => {
    expect(Rsvp.statusFilterFn(row('pending'), 'status', undefined)).toBe(true);
    expect(Rsvp.statusFilterFn(row('accepted'), 'status', [])).toBe(true);
  });

  test('keeps only the selected RSVP statuses', () => {
    expect(Rsvp.statusFilterFn(row('accepted'), 'status', ['accepted'])).toBe(true);
    expect(Rsvp.statusFilterFn(row('pending'), 'status', ['accepted'])).toBe(false);
    expect(Rsvp.statusFilterFn(row('timed_out'), 'status', ['pending', 'timed_out'])).toBe(true);
    expect(Rsvp.statusFilterFn(row('declined'), 'status', ['pending'])).toBe(false);
  });
});
