'use client';

import * as React from 'react';

const subscribeNoop = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * False during SSR and during the hydration render, true from the first
 * post-hydration render onward.
 *
 * Use this instead of the `useState(false)` + `useEffect(() => setState(true))`
 * pattern: it produces the same two-pass behaviour without a state update in
 * an effect (which `react-hooks/set-state-in-effect` rejects, and which costs
 * an extra cascading render).
 */
export function useIsHydrated(): boolean {
  return React.useSyncExternalStore(
    subscribeNoop,
    getClientSnapshot,
    getServerSnapshot,
  );
}
