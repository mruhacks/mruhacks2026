import { describe, expect, test } from 'vitest';

import { areApplicationsClosed, intakeCopy } from '@/lib/intake';
import { applicationsCloseAtError } from '@/app/dashboard/admin/events/schemas';

const NOW = new Date('2026-10-22T18:00:00Z');

describe('areApplicationsClosed', () => {
  test('open with no close date and no manual flag', () => {
    expect(
      areApplicationsClosed(
        { applicationsClosed: false, applicationsCloseAt: null },
        NOW,
      ),
    ).toBe(false);
  });

  test('open until the close instant', () => {
    expect(
      areApplicationsClosed(
        {
          applicationsClosed: false,
          applicationsCloseAt: new Date(NOW.getTime() + 1),
        },
        NOW,
      ),
    ).toBe(false);
  });

  test('closed at and after the close instant', () => {
    expect(
      areApplicationsClosed(
        { applicationsClosed: false, applicationsCloseAt: NOW },
        NOW,
      ),
    ).toBe(true);
  });

  test('the manual flag closes them before the close date', () => {
    expect(
      areApplicationsClosed(
        {
          applicationsClosed: true,
          applicationsCloseAt: new Date(NOW.getTime() + 60_000),
        },
        NOW,
      ),
    ).toBe(true);
  });
});

describe('applicationsCloseAtError', () => {
  const END = new Date('2026-10-25T22:00:00Z');

  test('any close date is fine without an end, and none is always fine', () => {
    expect(
      applicationsCloseAtError({ endsAt: null, applicationsCloseAt: NOW }),
    ).toBeNull();
    expect(
      applicationsCloseAtError({ endsAt: END, applicationsCloseAt: null }),
    ).toBeNull();
  });

  test('must be before the event ends', () => {
    expect(
      applicationsCloseAtError({ endsAt: END, applicationsCloseAt: NOW }),
    ).toBeNull();
    expect(
      applicationsCloseAtError({ endsAt: END, applicationsCloseAt: END }),
    ).toMatch(/before the event ends/);
  });
});

describe('intakeCopy', () => {
  test('agrees the verb with its noun', () => {
    expect(intakeCopy(true).closesLabel).toBe('Applications close');
    expect(intakeCopy(false).closesLabel).toBe('Registration closes');
  });
});
