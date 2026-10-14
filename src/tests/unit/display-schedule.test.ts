import { describe, test, expect } from 'vitest';

import {
  getVisibleEntries,
  type DisplayScheduleEntry,
} from '@/lib/display/schedule';

const at = (iso: string) => Date.parse(iso);

function entry(
  name: string,
  startsAt: string,
  endsAt: string | null,
): DisplayScheduleEntry {
  return { id: name, name, location: null, startsAt, endsAt };
}

// Real rows from the 2026 banner's schedule, as UTC instants (MDT is UTC−6).
const schedule = [
  entry('Games', '2026-10-25T05:00:00Z', '2026-10-25T07:15:00Z'),
  entry('Midnight Snack', '2026-10-25T06:00:00Z', '2026-10-25T06:30:00Z'),
  entry('Breakfast', '2026-10-25T15:00:00Z', '2026-10-25T15:30:00Z'),
  entry('Submissions Due', '2026-10-25T15:00:00Z', '2026-10-25T15:00:00Z'),
  entry('Closing Ceremony', '2026-10-25T20:00:00Z', null),
];

describe('getVisibleEntries', () => {
  test('before anything starts: nothing current, everything upcoming', () => {
    const result = getVisibleEntries(schedule, at('2026-10-24T00:00:00Z'));
    expect(result.current).toBeNull();
    expect(result.progress).toBe(0);
    expect(result.upcoming.map((e) => e.name)).toEqual([
      'Games',
      'Midnight Snack',
      'Breakfast',
      'Submissions Due',
      'Closing Ceremony',
    ]);
  });

  test('overlapping entries: the most recently started is current', () => {
    const result = getVisibleEntries(schedule, at('2026-10-25T06:15:00Z'));
    expect(result.current?.name).toBe('Midnight Snack');
    expect(result.progress).toBeCloseTo(0.5);
  });

  test('falls back to the longer entry once the overlap ends', () => {
    const result = getVisibleEntries(schedule, at('2026-10-25T06:45:00Z'));
    expect(result.current?.name).toBe('Games');
  });

  test('a zero-length deadline is never current, only upcoming', () => {
    const before = getVisibleEntries(schedule, at('2026-10-25T14:59:00Z'));
    expect(before.upcoming.map((e) => e.name)).toContain('Submissions Due');

    const on = getVisibleEntries(schedule, at('2026-10-25T15:00:00Z'));
    expect(on.current?.name).toBe('Breakfast');
    expect(on.upcoming.map((e) => e.name)).not.toContain('Submissions Due');
  });

  test('an entry with no end stays current, with no progress bar', () => {
    const result = getVisibleEntries(schedule, at('2026-10-26T00:00:00Z'));
    expect(result.current?.name).toBe('Closing Ceremony');
    expect(result.progress).toBe(0);
    expect(result.upcoming).toEqual([]);
  });

  test('does not depend on input order', () => {
    const reversed = [...schedule].reverse();
    const result = getVisibleEntries(reversed, at('2026-10-24T00:00:00Z'));
    expect(result.upcoming[0].name).toBe('Games');
  });
});
