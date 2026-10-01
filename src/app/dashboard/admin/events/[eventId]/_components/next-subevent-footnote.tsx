'use client';

import { LocalDateTime } from '@/components/local-date-time';
import { useNow } from '@/lib/use-now';

/** Sub-events are scheduled to the minute, so that's the resolution needed. */
const TICK_MS = 60_000;

export type SubeventFootnoteEntry = {
  id: string;
  name: string;
  /** ISO instant with `Z`. */
  startsAt: string;
};

/**
 * "Lunch next · Sat 12:30" under the sub-events tile.
 *
 * Client-only because it depends on "now", which is neither cacheable nor
 * prerenderable — the tile above it lives inside a cached scope, so deriving
 * this on the server would freeze it at cache-fill time and could assert a
 * sub-event is "next" when it finished an hour ago. Same reasoning, and same
 * `useNow` shape, as `EventLiveBadge`.
 *
 * Falls back to the static hint before hydration and once nothing is upcoming,
 * so the tile never renders an empty footnote.
 */
export function NextSubeventFootnote({
  entries,
}: {
  entries: SubeventFootnoteEntry[];
}) {
  const now = useNow(TICK_MS);

  const next =
    now === null
      ? undefined
      : entries.find((entry) => new Date(entry.startsAt).getTime() >= now);

  if (!next) return <>meals, workshops</>;

  return (
    <>
      <strong className='text-foreground'>{next.name}</strong> next ·{' '}
      <LocalDateTime
        value={next.startsAt}
        dateStyle='short'
        timeStyle='short'
      />
    </>
  );
}
