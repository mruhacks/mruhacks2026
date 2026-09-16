import type {
  CheckInOutcome,
  CheckInPatch,
  CheckInRosterRow,
  CheckInUpdates,
} from '@/app/dashboard/admin/events/check-in-actions';

/**
 * Slow enough that a door desk running all weekend barely registers it,
 * fast enough that a second scanner's work shows up before anyone wonders
 * whether the list is broken.
 */
export const ROSTER_POLL_INTERVAL_MS = 15_000;

/**
 * The newest check-in on screen — what the next poll asks the server to
 * report *after*. Null when nobody has checked in yet, which asks for the
 * lot; that set is empty in exactly that case.
 */
export function rosterWatermark(rows: CheckInRosterRow[]): string | null {
  let newest: string | null = null;
  for (const row of rows) {
    // ISO instants with a fixed `Z` suffix and fixed-width fields, so
    // lexicographic order is chronological order.
    if (row.checkedInAt && (newest === null || row.checkedInAt > newest)) {
      newest = row.checkedInAt;
    }
  }
  return newest;
}

export type RosterMerge =
  /** Nothing on screen needs to change. */
  | { kind: 'unchanged' }
  /** The patch applied cleanly; render these rows. */
  | { kind: 'patched'; rows: CheckInRosterRow[] }
  /** The patch can't explain what the server reports — refetch in full. */
  | { kind: 'stale' };

function samePatch(row: CheckInRosterRow, patch: CheckInPatch): boolean {
  return (
    row.checkedInAt === patch.checkedInAt &&
    row.checkedInAtLabel === patch.checkedInAtLabel &&
    row.checkedInByName === patch.checkedInByName
  );
}

/**
 * Folds a poll's result into the roster on screen.
 *
 * Two things a watermark alone cannot describe force a full reload: an undo,
 * which deletes a row and so moves no timestamp forward, and a participant
 * who was approved after the page loaded and has no roster row to patch.
 * Both show up as the merged check-in count disagreeing with the server's,
 * so the count is the authority and the patch is only the fast path.
 */
export function mergeCheckInUpdates(
  rows: CheckInRosterRow[],
  updates: CheckInUpdates,
): RosterMerge {
  const patches = new Map(
    updates.changed.map((patch) => [patch.userId, patch]),
  );

  // The watermark is truncated to milliseconds while the column keeps
  // microseconds, so the newest check-in is usually re-sent on every poll.
  // Patching only rows that actually differ keeps that a no-op.
  let touched = false;
  const merged = rows.map((row) => {
    const patch = patches.get(row.userId);
    if (!patch) return row;
    patches.delete(row.userId);
    if (samePatch(row, patch)) return row;
    touched = true;
    return {
      ...row,
      checkedInAt: patch.checkedInAt,
      checkedInAtLabel: patch.checkedInAtLabel,
      checkedInByName: patch.checkedInByName,
    };
  });

  // Anything left over is a check-in for someone the roster has never heard
  // of, which only a fresh roster can name.
  if (patches.size > 0) return { kind: 'stale' };

  const checkedIn = merged.reduce(
    (count, row) => (row.checkedInAt ? count + 1 : count),
    0,
  );
  if (checkedIn !== updates.checkedInCount) return { kind: 'stale' };

  return touched ? { kind: 'patched', rows: merged } : { kind: 'unchanged' };
}

/**
 * Folds a check-in this page just performed into the roster, so the row
 * updates at the speed of the scan rather than the next poll.
 *
 * Returns null when nobody on the roster matches — a participant approved
 * after the page loaded — which only a full reload can add.
 */
export function applyCheckIn(
  rows: CheckInRosterRow[],
  outcome: CheckInOutcome,
): CheckInRosterRow[] | null {
  return patchRow(rows, outcome.userId, {
    checkedInAt: outcome.checkedInAt,
    checkedInAtLabel: outcome.checkedInAtLabel,
    checkedInByName: outcome.checkedInByName,
  });
}

/** The undo counterpart: puts a row back to not-yet-arrived. */
export function clearCheckIn(
  rows: CheckInRosterRow[],
  userId: string,
): CheckInRosterRow[] | null {
  return patchRow(rows, userId, {
    checkedInAt: null,
    checkedInAtLabel: null,
    checkedInByName: null,
  });
}

function patchRow(
  rows: CheckInRosterRow[],
  userId: string,
  fields: Pick<
    CheckInRosterRow,
    'checkedInAt' | 'checkedInAtLabel' | 'checkedInByName'
  >,
): CheckInRosterRow[] | null {
  const index = rows.findIndex((row) => row.userId === userId);
  if (index === -1) return null;

  const patched = rows.slice();
  patched[index] = { ...rows[index], ...fields };
  return patched;
}
