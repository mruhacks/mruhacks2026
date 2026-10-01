import { describe, expect, test } from 'vitest';
import { currentScheduleEntryId, groupScheduleByDay } from '@/lib/schedule';

const at = (hour: number) => `2026-09-30T${hour}:00:00Z`;
const entries = [
  { id: 'breakfast', startsAt: at(10), endsAt: at(11) },
  { id: 'workshop', startsAt: at(12), endsAt: null },
  { id: 'lunch', startsAt: at(14), endsAt: at(15) },
];
describe('schedule focus', () => {
  test.each([
    [9, 'breakfast'],
    [10, 'breakfast'],
    [11, 'workshop'],
    [13, 'workshop'],
    [14, 'lunch'],
    [16, 'lunch'],
  ])('focuses the current, upcoming, or final entry at %s', (hour, id) => {
    const now =
      hour === 9
        ? Date.parse('2026-09-30T09:00:00Z')
        : Date.parse(at(Number(hour)));
    expect(currentScheduleEntryId(entries, now)).toBe(id);
  });
  test('ignores undated entries and handles an empty schedule', () => {
    expect(currentScheduleEntryId([], Date.parse(at(12)))).toBeNull();
    expect(
      currentScheduleEntryId(
        [{ id: 'undated', startsAt: null, endsAt: null }],
        Date.parse(at(12)),
      ),
    ).toBeNull();
  });
  test('keeps an ongoing entry ahead of the next item, including overlapping entries', () => {
    expect(
      currentScheduleEntryId(
        [{ id: 'long', startsAt: at(10), endsAt: at(15) }, ...entries],
        Date.parse(at(13)),
      ),
    ).toBe('long');
  });
});

describe('schedule day groups', () => {
  const entries = [
    { id: 'evening', startsAt: '2026-10-01T05:00:00Z' },
    { id: 'morning', startsAt: '2026-10-01T15:00:00Z' },
    { id: 'next-week', startsAt: '2026-10-08T05:00:00Z' },
    { id: 'undated', startsAt: null },
  ];
  test('groups by the displayed zone instead of the UTC day or weekday name', () => {
    const days = groupScheduleByDay(entries, 'America/Edmonton');
    expect(days.map((day) => day.entries.map((entry) => entry.id))).toEqual([
      ['evening'],
      ['morning'],
      ['next-week'],
      ['undated'],
    ]);
    expect(days[0].key).not.toBe(days[2].key);
    expect(
      groupScheduleByDay(entries, 'UTC')[0].entries.map((entry) => entry.id),
    ).toEqual(['evening', 'morning']);
  });
  test('handles an empty schedule', () => {
    expect(groupScheduleByDay([], 'America/Edmonton')).toEqual([]);
  });
});
