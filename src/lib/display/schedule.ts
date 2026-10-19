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

export type DisplaySettings = { showClock: boolean; theme: DisplayTheme };

export type DisplayFeed = {
  schedule: DisplayScheduleEntry[];
  settings: DisplaySettings;
};

export type VisibleEntries = {
  current: DisplayScheduleEntry | null;
  /** How far through `current` we are, 0–1. */
  progress: number;
  /** Other entries still running alongside `current`, earliest start first. */
  ongoing: DisplayScheduleEntry[];
  upcoming: DisplayScheduleEntry[];
};

/**
 * How long an open-ended entry with nothing after it stays on screen. Without
 * a cap, the last open-ended entry would read as "on now" forever.
 */
const OPEN_ENDED_MAX_MS = 60 * 60 * 1000;

const isDeadline = (entry: DisplayScheduleEntry) =>
  entry.endsAt === entry.startsAt;

/**
 * When an entry stops being "on": its own end, or for an open-ended one
 * ("Check-in opens"), the next entry's start — capped at an hour when nothing
 * follows. Deadlines don't end anything; they aren't activities.
 */
function effectiveEnd(
  entry: DisplayScheduleEntry,
  sorted: DisplayScheduleEntry[],
): number {
  if (entry.endsAt) return Date.parse(entry.endsAt);
  const start = Date.parse(entry.startsAt);
  const next = sorted.find(
    (other) => !isDeadline(other) && Date.parse(other.startsAt) > start,
  );
  return next ? Date.parse(next.startsAt) : start + OPEN_ENDED_MAX_MS;
}

/**
 * Splits the schedule around `now` (epoch ms): the entry on now — the most
 * recently started one if several overlap — any others still running, and
 * everything still to come, soonest first. An entry that starts and ends at
 * the same instant (a deadline) is never "on", only upcoming.
 */
export function getVisibleEntries(
  schedule: DisplayScheduleEntry[],
  now: number,
): VisibleEntries {
  const sorted = [...schedule].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );

  const running = sorted.filter(
    (entry) =>
      Date.parse(entry.startsAt) <= now && now < effectiveEnd(entry, sorted),
  );
  const current = running.at(-1) ?? null;

  let progress = 0;
  if (current?.endsAt) {
    const start = Date.parse(current.startsAt);
    const end = Date.parse(current.endsAt);
    progress = Math.min(Math.max((now - start) / (end - start), 0), 1);
  }

  return {
    current,
    progress,
    ongoing: running.slice(0, -1),
    upcoming: sorted.filter((entry) => Date.parse(entry.startsAt) > now),
  };
}
