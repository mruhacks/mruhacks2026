'use client';

import { Badge } from '@/components/ui/badge';
import { parseInstant } from '@/lib/datetime';
import { useNow } from '@/lib/use-now';

type Props = {
  startsAt: Date | string | null;
  endsAt: Date | string | null;
};

/** Re-evaluated on this cadence so a tab left open flips to Live on time. */
const TICK_MS = 60_000;

/**
 * Live / Upcoming / Ended, derived from the event's instants and the current
 * time.
 *
 * Deliberately client-only. "Now" is neither cacheable nor prerenderable —
 * baking it into the header's `use cache` scope would freeze the badge for
 * the whole cache lifetime and make the prerendered shell assert a state
 * that may already be wrong. Reading the clock in an effect rather than
 * during render also keeps every viewer's SSR output identical, the same
 * reason `LocalDateTime` swaps zones only after hydration.
 */
export function EventLiveBadge({ startsAt, endsAt }: Props) {
  const now = useNow(TICK_MS);
  if (now === null) return null;

  const start = parseInstant(startsAt);
  if (!start) return null;
  const end = parseInstant(endsAt);

  if (now < start.getTime()) {
    return <Badge variant='secondary'>Upcoming</Badge>;
  }
  if (end && now > end.getTime()) {
    return <Badge variant='outline'>Ended</Badge>;
  }
  return <Badge variant='success'>Live</Badge>;
}
