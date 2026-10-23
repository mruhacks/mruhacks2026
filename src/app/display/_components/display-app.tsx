'use client';

import * as React from 'react';

import type { DisplayTheme } from '@/db/display';
import type { DisplayFeed } from '@/lib/display/schedule';
import { Aurora } from './aurora';
import { DisplayScreen } from './display-screen';
import styles from './display.module.css';

/**
 * A lobby display: polls the public feed every 15 seconds and renders it. A
 * failed poll keeps the last good feed on screen — a wall screen has nobody in
 * front of it to click "retry".
 */

const FEED_INTERVAL_MS = 15_000;
/** A half-open connection would otherwise hang a poll, and polling, forever. */
const FEED_TIMEOUT_MS = 10_000;
/** The last theme this screen showed, so a reload starts in it. */
const THEME_STORAGE_KEY = 'display-theme';

function rememberedTheme(): DisplayTheme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** The remembered theme is only read once; nothing to subscribe to. */
const subscribeToNothing = () => () => {};

export function DisplayApp() {
  const [feed, setFeed] = React.useState<DisplayFeed | null>(null);
  // Only for the moments before the first feed lands. Null on the server
  // and during hydration, so both renders agree.
  const initialTheme = React.useSyncExternalStore<DisplayTheme | null>(subscribeToNothing, rememberedTheme, () => null);

  React.useEffect(() => {
    let cancelled = false;
    let timeout: number | undefined;

    const poll = async () => {
      try {
        const res = await fetch('/api/display/feed', {
          cache: 'no-store',
          signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
        });
        if (res.ok && !cancelled) setFeed(await res.json());
      } catch {
        // Network blip or timeout: keep showing the last good feed.
      }
      if (!cancelled) timeout = window.setTimeout(poll, FEED_INTERVAL_MS);
    };
    void poll();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  const theme = feed?.settings.theme ?? initialTheme;

  React.useEffect(() => {
    if (!feed) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, feed.settings.theme);
    } catch {
      // Storage blocked: the next reload just starts light.
    }
  }, [feed]);

  const showClock = feed?.settings.showClock ?? false;
  const cx = (...names: (string | false)[]) => names.filter(Boolean).join(' ');

  // One shell and one Aurora for the screen's whole life: the Aurora eases
  // between themes itself, so a theme change (or the first feed) never tears
  // down its WebGL context. It waits for a theme to start in, and the banner
  // waits for the first feed so it never renders without the clock and jumps.
  return (
    <main
      className={cx(styles.shell, theme === 'dark' && styles.dark, showClock && styles.withSidebar)}
      aria-busy={!feed}
    >
      {theme && <Aurora lightMode={theme === 'light'} />}
      {feed && <DisplayScreen feed={feed} />}
    </main>
  );
}
