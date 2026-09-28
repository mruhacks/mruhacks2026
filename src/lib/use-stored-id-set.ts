'use client';

import * as React from 'react';

/**
 * A set of string ids persisted in `localStorage`, shared by every component
 * reading the same key and kept in sync across tabs.
 *
 * `null` during SSR and the hydration render, so a caller can render its
 * unfiltered server output first and apply the stored selection only once
 * the browser's value is known — reading storage during the hydration render
 * would make the first client render differ from the server's.
 *
 * Built on `useSyncExternalStore` for the same reason `useIsHydrated` is:
 * a `useState` + `useEffect` pair is rejected by
 * `react-hooks/set-state-in-effect` and costs a cascading render. Every read
 * and write is wrapped — `localStorage` throws outright in a private window
 * or with site data blocked, and a caller must still work when it does.
 */
export function useStoredIdSet(key: string): {
  ids: ReadonlySet<string> | null;
  toggle: (id: string) => void;
  clear: () => void;
} {
  const store = React.useMemo(() => getStore(key), [key]);

  const ids = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot,
  );

  return React.useMemo(
    () => ({ ids, toggle: store.toggle, clear: store.clear }),
    [ids, store],
  );
}

const getServerSnapshot = (): ReadonlySet<string> | null => null;

const EMPTY: ReadonlySet<string> = new Set();

type Store = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => ReadonlySet<string> | null;
  toggle: (id: string) => void;
  clear: () => void;
};

const stores = new Map<string, Store>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse(raw: string | null): ReadonlySet<string> {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return EMPTY;
  }
}

function getStore(key: string): Store {
  const existing = stores.get(key);
  if (existing) return existing;

  const listeners = new Set<() => void>();
  // Cached so `getSnapshot` returns a referentially stable value while the
  // stored string is unchanged — re-parsing on every call would hand React a
  // new Set each render and loop forever.
  let cachedRaw: string | null = null;
  let cachedValue: ReadonlySet<string> | null = null;

  function emit() {
    for (const listener of listeners) listener();
  }

  function write(next: ReadonlySet<string>) {
    try {
      window.localStorage.setItem(key, JSON.stringify([...next]));
    } catch {
      // Storage unavailable (private window, blocked site data). The
      // selection just doesn't survive this reload.
    }
    emit();
  }

  const store: Store = {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      // Another tab writing the same key fires `storage` here.
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) emit();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(onStoreChange);
        window.removeEventListener('storage', onStorage);
      };
    },
    getSnapshot() {
      const raw = readRaw(key);
      if (cachedValue === null || raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = parse(raw);
      }
      return cachedValue;
    },
    toggle(id) {
      const current = store.getSnapshot() ?? EMPTY;
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(next);
    },
    clear() {
      write(EMPTY);
    },
  };

  stores.set(key, store);
  return store;
}
