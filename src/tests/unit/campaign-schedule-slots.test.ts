import { describe, expect, test } from 'vitest';
import { campaignScheduleSlots } from '@/lib/campaigns/schedule-slots';
import { toZonedOffsetString } from '@/lib/datetime';

describe('campaign scheduling slots', () => {
  test.each([
    ['Asia/Kolkata', '30'],
    ['Asia/Kathmandu', '45'],
    ['America/St_Johns', '30'],
    ['America/Edmonton', '00'],
  ])(
    'offers valid UTC-hour instants on the local date in %s',
    (zone, minutes) => {
      const slots = campaignScheduleSlots('2026-10-21', zone);
      expect(slots).toHaveLength(24);
      for (const slot of slots) {
        const instant = new Date(slot);
        expect(instant.getUTCMinutes()).toBe(0);
        expect(instant.getUTCSeconds()).toBe(0);
        expect(toZonedOffsetString(instant, zone).slice(0, 10)).toBe(
          '2026-10-21',
        );
        expect(toZonedOffsetString(instant, zone).slice(14, 16)).toBe(minutes);
      }
    },
  );

  test('includes both repeated hours and omits nonexistent hours at DST changes', () => {
    const zone = 'America/Edmonton';
    const spring = campaignScheduleSlots('2026-03-08', zone);
    const fall = campaignScheduleSlots('2026-11-01', zone);
    expect(spring).toHaveLength(23);
    expect(fall).toHaveLength(25);
    expect(
      spring.map((slot) =>
        toZonedOffsetString(new Date(slot), zone).slice(11, 13),
      ),
    ).not.toContain('02');
    const repeated = fall
      .map((slot) => toZonedOffsetString(new Date(slot), zone))
      .filter((slot) => slot.slice(11, 13) === '01');
    expect(repeated).toEqual([
      '2026-11-01T01:00:00-06:00',
      '2026-11-01T01:00:00-07:00',
    ]);
    expect(new Set(fall).size).toBe(25);
  });
});
