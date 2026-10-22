import { describe, test, expect } from 'vitest';

import * as Display from '@/lib/display';

const at = (iso: string) => Date.parse(iso);

function entry(name: string, startsAt: string, endsAt: string | null): Display.DisplayScheduleEntry {
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
    const result = Display.getVisibleEntries(schedule, at('2026-10-24T00:00:00Z'));
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
    const result = Display.getVisibleEntries(schedule, at('2026-10-25T06:15:00Z'));
    expect(result.current?.name).toBe('Midnight Snack');
    expect(result.progress).toBeCloseTo(0.5);
    // The longer entry is still running, so it stays on screen too.
    expect(result.ongoing.map((e) => e.name)).toEqual(['Games']);
  });

  test('falls back to the longer entry once the overlap ends', () => {
    const result = Display.getVisibleEntries(schedule, at('2026-10-25T06:45:00Z'));
    expect(result.current?.name).toBe('Games');
    expect(result.ongoing).toEqual([]);
  });

  test('a zero-length deadline is never current, only upcoming', () => {
    const before = Display.getVisibleEntries(schedule, at('2026-10-25T14:59:00Z'));
    expect(before.upcoming.map((e) => e.name)).toContain('Submissions Due');

    const on = Display.getVisibleEntries(schedule, at('2026-10-25T15:00:00Z'));
    expect(on.current?.name).toBe('Breakfast');
    expect(on.upcoming.map((e) => e.name)).not.toContain('Submissions Due');
  });

  test('an open-ended last entry is current for an hour, with no progress bar', () => {
    const during = Display.getVisibleEntries(schedule, at('2026-10-25T20:30:00Z'));
    expect(during.current?.name).toBe('Closing Ceremony');
    expect(during.progress).toBe(0);
    expect(during.upcoming).toEqual([]);

    const after = Display.getVisibleEntries(schedule, at('2026-10-26T00:00:00Z'));
    expect(after.current).toBeNull();
  });

  test('an open-ended entry ends when the next one starts', () => {
    const openEnded = [
      entry('Check-in opens', '2026-10-24T23:00:00Z', null),
      entry('RSVP Deadline', '2026-10-25T00:00:00Z', '2026-10-25T00:00:00Z'),
      entry('Opening Ceremony', '2026-10-25T01:00:00Z', '2026-10-25T01:30:00Z'),
    ];
    // A deadline in between doesn't end it early…
    expect(Display.getVisibleEntries(openEnded, at('2026-10-25T00:30:00Z')).current?.name).toBe('Check-in opens');
    // …but the real one does, and for good.
    const later = Display.getVisibleEntries(openEnded, at('2026-10-25T02:00:00Z'));
    expect(later.current).toBeNull();
    expect(later.ongoing).toEqual([]);
  });

  test('does not depend on input order', () => {
    const reversed = [...schedule].reverse();
    const result = Display.getVisibleEntries(reversed, at('2026-10-24T00:00:00Z'));
    expect(result.upcoming[0].name).toBe('Games');
  });
});
