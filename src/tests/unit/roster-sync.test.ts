/**
 * Tests for the check-in page's poll-and-patch merge logic.
 *
 * The interesting cases are the ones a watermark alone cannot describe: an
 * undo moves no timestamp forward, and a check-in for somebody the roster
 * has never heard of has no row to land on. Both have to fall back to a
 * full reload rather than silently leaving the list wrong.
 */
import { describe, test, expect, vi, afterEach } from 'vitest';

import type {
  CheckInOutcome,
  CheckInRosterRow,
} from '@/app/dashboard/admin/events/check-in-actions';
import {
  applyCheckIn,
  clearCheckIn,
  mergeCheckInUpdates,
  rosterWatermark,
  startRosterPolling,
  type PollingHost,
} from '@/app/dashboard/admin/events/[eventId]/@checkin/roster-sync';

function row(
  userId: string,
  checkedInAt: string | null = null,
): CheckInRosterRow {
  return {
    userId,
    name: `User ${userId}`,
    email: `${userId}@test.dev`,
    checkedInAt,
    checkedInAtLabel: checkedInAt ? 'Sep 16, 2026, 9:00 AM MT' : null,
    checkedInByName: checkedInAt ? 'Door Volunteer' : null,
  };
}

const AT_NINE = '2026-09-16T15:00:00.000Z';
const AT_TEN = '2026-09-16T16:00:00.000Z';

describe('rosterWatermark', () => {
  test('is null when nobody has checked in', () => {
    expect(rosterWatermark([row('a'), row('b')])).toBeNull();
  });

  test('is the newest check-in, whatever order the rows arrive in', () => {
    const rows = [row('a', AT_TEN), row('b'), row('c', AT_NINE)];
    expect(rosterWatermark(rows)).toBe(AT_TEN);
  });
});

describe('mergeCheckInUpdates', () => {
  test('patches a new check-in into the row it belongs to', () => {
    const rows = [row('a', AT_NINE), row('b')];
    const merge = mergeCheckInUpdates(rows, {
      changed: [
        {
          userId: 'b',
          checkedInAt: AT_TEN,
          checkedInAtLabel: 'Sep 16, 2026, 10:00 AM MT',
          checkedInByName: 'Second Scanner',
        },
      ],
      checkedInCount: 2,
    });

    expect(merge).toMatchObject({ kind: 'patched' });
    if (merge.kind !== 'patched') return;
    expect(merge.rows[1]).toMatchObject({
      userId: 'b',
      checkedInAt: AT_TEN,
      checkedInByName: 'Second Scanner',
    });
    // Untouched rows keep their identity so the list does not re-render whole.
    expect(merge.rows[0]).toBe(rows[0]);
  });

  test('reports unchanged when the server re-sends what is already on screen', () => {
    const rows = [row('a', AT_NINE)];
    const merge = mergeCheckInUpdates(rows, {
      changed: [
        {
          userId: 'a',
          checkedInAt: AT_NINE,
          checkedInAtLabel: rows[0].checkedInAtLabel!,
          checkedInByName: rows[0].checkedInByName,
        },
      ],
      checkedInCount: 1,
    });

    expect(merge).toEqual({ kind: 'unchanged' });
  });

  test('is stale when the count falls short, which is how an undo shows up', () => {
    const rows = [row('a', AT_NINE), row('b', AT_TEN)];
    const merge = mergeCheckInUpdates(rows, {
      changed: [],
      checkedInCount: 1,
    });

    expect(merge).toEqual({ kind: 'stale' });
  });

  test('is stale when a check-in names somebody the roster does not have', () => {
    const merge = mergeCheckInUpdates([row('a')], {
      changed: [
        {
          userId: 'newcomer',
          checkedInAt: AT_TEN,
          checkedInAtLabel: 'Sep 16, 2026, 10:00 AM MT',
          checkedInByName: null,
        },
      ],
      checkedInCount: 1,
    });

    expect(merge).toEqual({ kind: 'stale' });
  });
});

describe('applyCheckIn / clearCheckIn', () => {
  const outcome: CheckInOutcome = {
    userId: 'b',
    name: 'User b',
    alreadyCheckedIn: false,
    checkedInAt: AT_TEN,
    checkedInAtLabel: 'Sep 16, 2026, 10:00 AM MT',
    checkedInByName: null,
  };

  test('applyCheckIn marks the scanned row without touching the rest', () => {
    const rows = [row('a', AT_NINE), row('b')];
    const patched = applyCheckIn(rows, outcome);

    expect(patched?.[1]).toMatchObject({ userId: 'b', checkedInAt: AT_TEN });
    expect(patched?.[0]).toBe(rows[0]);
    expect(rows[1].checkedInAt).toBeNull();
  });

  test('applyCheckIn returns null for someone with no roster row', () => {
    expect(applyCheckIn([row('a')], outcome)).toBeNull();
  });

  test('clearCheckIn puts a row back to not-yet-arrived', () => {
    const patched = clearCheckIn([row('a', AT_NINE)], 'a');

    expect(patched?.[0]).toMatchObject({
      userId: 'a',
      checkedInAt: null,
      checkedInAtLabel: null,
      checkedInByName: null,
    });
  });

  test('clearCheckIn returns null for someone with no roster row', () => {
    expect(clearCheckIn([row('a', AT_NINE)], 'b')).toBeNull();
  });
});

// ─── Polling schedule ──────────────────────────────────────────────────────────

const INTERVAL = 1000;

/** Stands in for the tab: `active` is what `document.hidden` and
 *  `document.hasFocus()` together answer, and `change()` is the
 *  visibilitychange/focus/blur event the real host listens for. */
function fakeHost() {
  let active = true;
  const listeners = new Set<() => void>();

  const host: PollingHost = {
    isActive: () => active,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };

  return {
    host,
    listenerCount: () => listeners.size,
    set(next: boolean) {
      active = next;
      for (const listener of listeners) listener();
    },
    /** A redundant event with no change behind it — switching tabs fires
     *  both a blur and a visibilitychange. */
    notify() {
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('startRosterPolling', () => {
  test('polls on the interval while the page is active', () => {
    vi.useFakeTimers();
    const tab = fakeHost();
    const poll = vi.fn();

    const stop = startRosterPolling(poll, tab.host, INTERVAL);
    // Starting active is not a return: the caller just loaded the roster.
    expect(poll).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INTERVAL * 3);
    expect(poll).toHaveBeenCalledTimes(3);
    stop();
  });

  test('stops entirely while backgrounded or unfocused', () => {
    vi.useFakeTimers();
    const tab = fakeHost();
    const poll = vi.fn();

    const stop = startRosterPolling(poll, tab.host, INTERVAL);
    tab.set(false);

    vi.advanceTimersByTime(INTERVAL * 10);
    expect(poll).not.toHaveBeenCalled();
    stop();
  });

  test('polls immediately on coming back, then resumes the interval', () => {
    vi.useFakeTimers();
    const tab = fakeHost();
    const poll = vi.fn();

    const stop = startRosterPolling(poll, tab.host, INTERVAL);
    tab.set(false);
    vi.advanceTimersByTime(INTERVAL * 10);

    tab.set(true);
    expect(poll).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INTERVAL);
    expect(poll).toHaveBeenCalledTimes(2);
    stop();
  });

  test('ignores a repeat event that changes nothing', () => {
    vi.useFakeTimers();
    const tab = fakeHost();
    const poll = vi.fn();

    const stop = startRosterPolling(poll, tab.host, INTERVAL);
    tab.notify();
    tab.notify();
    expect(poll).not.toHaveBeenCalled();

    // One interval's worth of polls, not one per event.
    vi.advanceTimersByTime(INTERVAL);
    expect(poll).toHaveBeenCalledTimes(1);
    stop();
  });

  test('starts asleep when the page is mounted in a background tab', () => {
    vi.useFakeTimers();
    const tab = fakeHost();
    tab.set(false);
    const poll = vi.fn();

    const stop = startRosterPolling(poll, tab.host, INTERVAL);
    vi.advanceTimersByTime(INTERVAL * 5);
    expect(poll).not.toHaveBeenCalled();

    tab.set(true);
    expect(poll).toHaveBeenCalledTimes(1);
    stop();
  });

  test('stopping unsubscribes and cancels the interval', () => {
    vi.useFakeTimers();
    const tab = fakeHost();
    const poll = vi.fn();

    const stop = startRosterPolling(poll, tab.host, INTERVAL);
    stop();

    expect(tab.listenerCount()).toBe(0);
    tab.set(false);
    tab.set(true);
    vi.advanceTimersByTime(INTERVAL * 5);
    expect(poll).not.toHaveBeenCalled();
  });
});
