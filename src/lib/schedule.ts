import { formatInstant } from '@/lib/datetime';

/** Group by the viewer's calendar date, keeping different weeks separate. */
export function groupScheduleByDay<T extends { startsAt: string | null }>(
  entries: T[],
  timeZone: string,
): { key: string; entries: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = entry.startsAt
      ? formatInstant(new Date(entry.startsAt), timeZone, 'en-CA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      : 'undated';
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return Array.from(groups, ([key, entries]) => ({ key, entries }));
}

export type ScheduleInstant = {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
};

/** Prefer an ongoing entry, then the next one, then the last completed entry.
 * An open-ended entry runs until the next distinct start on the schedule. */
export function currentScheduleEntryId(
  entries: ScheduleInstant[],
  now: number,
) {
  const sorted = entries
    .filter((entry) => entry.startsAt !== null)
    .toSorted((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
  const current = sorted.find((entry) => {
    const start = Date.parse(entry.startsAt!);
    const next = sorted.find(
      (candidate) => Date.parse(candidate.startsAt!) > start,
    );
    const end = entry.endsAt
      ? Date.parse(entry.endsAt)
      : next
        ? Date.parse(next.startsAt!)
        : Infinity;
    return start <= now && now < end;
  });
  return (
    current?.id ??
    sorted.find((entry) => Date.parse(entry.startsAt!) > now)?.id ??
    sorted.at(-1)?.id ??
    null
  );
}
