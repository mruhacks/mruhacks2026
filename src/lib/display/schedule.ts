/**
 * The display feed's wire format and the schedule logic the screen runs
 * against it. Client-safe: no server imports.
 */

import type { DisplayTheme } from '@/db/display';

export type DisplayScheduleEntry = {
  id: string;
  name: string;
  location: string | null;
  /** ISO instant. */
  startsAt: string;
  /** ISO instant, or null for an entry that runs open-ended. */
  endsAt: string | null;
};

export type DisplayFeed = {
  event: {
    name: string;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
  schedule: DisplayScheduleEntry[];
  settings: { showClock: boolean; theme: DisplayTheme };
};

export type VisibleEntries = {
  current: DisplayScheduleEntry | null;
  /** How far through `current` we are, 0–1. */
  progress: number;
  upcoming: DisplayScheduleEntry[];
};

function isRunning(entry: DisplayScheduleEntry, now: number): boolean {
  const start = Date.parse(entry.startsAt);
  if (start > now) return false;
  return entry.endsAt === null || now < Date.parse(entry.endsAt);
}

/**
 * Splits the schedule around `now` (epoch ms): the entry on now — the most
 * recently started one if several overlap — and everything still to come,
 * soonest first. An entry that starts and ends at the same instant (a
 * deadline) is never "on", only upcoming.
 */
export function getVisibleEntries(
  schedule: DisplayScheduleEntry[],
  now: number,
): VisibleEntries {
  const sorted = [...schedule].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );

  let current: DisplayScheduleEntry | null = null;
  for (const entry of sorted) {
    if (isRunning(entry, now)) current = entry;
  }

  let progress = 0;
  if (current?.endsAt) {
    const start = Date.parse(current.startsAt);
    const end = Date.parse(current.endsAt);
    progress = Math.min(Math.max((now - start) / (end - start), 0), 1);
  }

  return {
    current,
    progress,
    upcoming: sorted.filter((entry) => Date.parse(entry.startsAt) > now),
  };
}
