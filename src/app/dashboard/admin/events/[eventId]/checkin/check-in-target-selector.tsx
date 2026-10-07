'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { LocalDateRange } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

/** A sub-event slot is minutes long at worst; a minute's resolution is plenty. */
const TICK_MS = 60_000;

export type CheckInTargetOption = {
  id: string;
  name: string;
  /** ISO instants with `Z` — never a Date across the server boundary. */
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
};

type Props = {
  /** The main event's uuid, which is also the id of the "door" target. */
  eventId: string;
  eventName: string;
  subevents: CheckInTargetOption[];
  /** The armed target: `eventId`, or one of `subevents`. */
  targetId: string;
};

/**
 * Picks which event a scan gets recorded against — the main event's door, or
 * one of its sub-events.
 *
 * A mis-armed scanner is the failure mode that matters here: it writes rows
 * that look perfectly valid and nothing catches it until someone reads the
 * numbers days later. So the armed target is stated in full above the scanner
 * rather than being implied by which pill looks selected, and a sub-event gets
 * a colour the door doesn't, readable across a room.
 *
 * Targets are picked from a `Select`: an event can carry many schedule
 * entries, and a pill row of them overflowed off-screen on a phone, hiding
 * most of the options behind a horizontal scroll.
 */
export function CheckInTargetSelector({
  eventId,
  eventName,
  subevents,
  targetId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const armed = subevents.find((subevent) => subevent.id === targetId) ?? null;
  // Null until hydration: "now" differs between the server and the viewer, so
  // nothing derived from it may reach first paint (same reason as
  // `EventLiveBadge`). Before it resolves, no target reads as ended — which is
  // the neutral state, since "ended" here is only ever advisory.
  const now = useNow(TICK_MS);
  const hasEnded = (endsAt: string | null) =>
    now !== null && endsAt != null && new Date(endsAt).getTime() < now;
  const armedEnded = hasEnded(armed?.endsAt ?? null);

  function arm(id: string) {
    if (id === targetId) return;
    // push, not replace: "I armed the wrong one" should be a Back away.
    router.push(id === eventId ? pathname : `${pathname}?target=${id}`, {
      scroll: false,
    });
  }

  return (
    <div
      className={cn(
        'space-y-3 rounded-xl border p-4',
        armed
          ? 'border-amber-500/50 bg-amber-500/10'
          : 'bg-muted/30 border-border',
      )}
    >
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
            Checking in to
          </p>
          <p className='mt-0.5 truncate text-xl font-semibold sm:text-lg'>
            {armed ? armed.name : eventName}
          </p>
          <p className='text-muted-foreground mt-0.5 text-sm'>
            {armed ? (
              <>
                <LocalDateRange
                  start={armed.startsAt}
                  end={armed.endsAt}
                  weekday='long'
                />
                {armed.location ? ` · ${armed.location}` : ''}
              </>
            ) : (
              'Main event — the door'
            )}
          </p>
        </div>
        {armed && (
          <Badge className='shrink-0 border-amber-500/40 bg-amber-500/20 text-amber-900 dark:text-amber-100'>
            Schedule entry
          </Badge>
        )}
      </div>

      {/* Advisory, not a block: check-in freezes on the *main* event's end, so
          a meal that ran over is still recordable — and so are corrections. */}
      {armedEnded && (
        <p className='text-sm text-amber-800 dark:text-amber-200'>
          This schedule entry has already ended. You can still record check-ins
          for it.
        </p>
      )}

      <Select value={targetId} onValueChange={arm}>
        <SelectTrigger
          aria-label='Check-in target'
          className='bg-background h-11 w-full sm:h-9'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={eventId}>Main event</SelectItem>
          {subevents.map((subevent) => {
            const ended = hasEnded(subevent.endsAt);
            return (
              <SelectItem
                key={subevent.id}
                value={subevent.id}
                // Past sub-events stay pickable — a missed scan gets fixed
                // after the fact — but shouldn't read as today's choice.
                className={cn(ended && 'text-muted-foreground')}
              >
                {subevent.name}
                {ended ? ' (ended)' : ''}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
