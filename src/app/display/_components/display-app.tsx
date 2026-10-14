'use client';

import * as React from 'react';

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

export function DisplayApp() {
  const [feed, setFeed] = React.useState<DisplayFeed | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let timeout: number | undefined;

    const poll = async () => {
      try {
        const res = await fetch('/api/display/feed', { cache: 'no-store' });
        if (res.ok && !cancelled) setFeed(await res.json());
      } catch {
        // Network blip: keep showing the last good feed.
      }
      if (!cancelled) timeout = window.setTimeout(poll, FEED_INTERVAL_MS);
    };
    void poll();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  // The banner waits for the first feed, so it never renders with the wrong
  // theme or without the clock and then jumps.
  if (feed) return <DisplayScreen feed={feed} />;
  return (
    <main className={styles.shell} aria-busy>
      <Aurora lightMode />
    </main>
  );
}
