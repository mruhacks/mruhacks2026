'use client';

import * as React from 'react';

/**
 * The current time, as a millisecond timestamp, refreshed on an interval.
 *
 * Returns `null` during SSR and the hydration render, so a caller renders
 * nothing (or a neutral state) on the server: "now" differs between the
 * server and the viewer, and anything derived from it inside a cached or
 * prerendered scope would be frozen at cache-fill time.
 *
 * Built on `useSyncExternalStore` rather than `useState` + `useEffect` for
 * the same reason `useIsHydrated` is — a state update inside an effect is
 * rejected by `react-hooks/set-state-in-effect` and costs a cascading
 * render. One timer is shared by every subscriber and cleared when the last
 * one unmounts.
 */
export function useNow(intervalMs: number): number | null {
  const store = React.useMemo(() => getClock(intervalMs), [intervalMs]);
  return React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot,
  );
}

const getServerSnapshot = (): number | null => null;

type Clock = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => number | null;
};

const clocks = new Map<number, Clock>();

/** One shared clock per interval, so N badges don't start N timers. */
function getClock(intervalMs: number): Clock {
  const existing = clocks.get(intervalMs);
  if (existing) return existing;

  const listeners = new Set<() => void>();
  let now: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const clock: Clock = {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      if (timer === null) {
        // React re-reads the snapshot right after subscribing, so setting it
        // here is what promotes the initial `null` to a real time.
        now = Date.now();
        timer = setInterval(() => {
          now = Date.now();
          for (const listener of listeners) listener();
        }, intervalMs);
      }
      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
          now = null;
        }
      };
    },
    getSnapshot: () => now,
  };

  clocks.set(intervalMs, clock);
  return clock;
}
