import { toZonedOffsetString } from '@/lib/datetime';

/** UTC-hour instants on the selected calendar date in the viewer's zone.
 * Iterating instants also preserves both occurrences of a repeated DST hour.
 */
export function campaignScheduleSlots(
  date: string,
  timeZone: string,
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const midnight = new Date(`${date}T00:00:00Z`).getTime();
  if (!Number.isFinite(midnight)) return [];
  const slots: string[] = [];
  for (let offset = -14; offset < 38; offset++) {
    const instant = new Date(midnight + offset * 3_600_000);
    if (toZonedOffsetString(instant, timeZone).slice(0, 10) === date) {
      slots.push(instant.toISOString());
    }
  }
  return slots;
}
