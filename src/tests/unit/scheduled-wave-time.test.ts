import { describe, expect, test } from 'vitest';

import {
  estimateAutoWaveAt,
  nextRsvpCronRunAt,
} from '@/lib/rsvp/scheduled-wave-time';

const at = (iso: string) => new Date(iso);

describe('nextRsvpCronRunAt', () => {
  test('rounds up to the next top of the hour, keeping an exact hour', () => {
    expect(nextRsvpCronRunAt(at('2026-10-03T14:20:00.000Z'))).toEqual(
      at('2026-10-03T15:00:00.000Z'),
    );
    expect(nextRsvpCronRunAt(at('2026-10-03T14:00:00.000Z'))).toEqual(
      at('2026-10-03T14:00:00.000Z'),
    );
  });
});

describe('estimateAutoWaveAt', () => {
  const now = at('2026-10-03T14:20:00.000Z');

  test('never schedules a first wave', () => {
    expect(estimateAutoWaveAt(null, now)).toBeNull();
  });

  test('an open wave: the first hourly run after it ends', () => {
    expect(estimateAutoWaveAt(at('2026-10-04T09:30:00.000Z'), now)).toEqual(
      at('2026-10-04T10:00:00.000Z'),
    );
  });

  test('a closed wave: the next hourly run from now', () => {
    expect(estimateAutoWaveAt(at('2026-10-01T09:30:00.000Z'), now)).toEqual(
      at('2026-10-03T15:00:00.000Z'),
    );
  });
});
