import * as React from 'react';
import { CalendarClock, MapPin } from 'lucide-react';

import { LocalDateRange } from '@/components/local-date-time';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DEFAULT_LOCALE, EVENT_TIME_ZONE, formatInstant } from '@/lib/datetime';

export type ScheduleEntry = {
  id: string;
  name: string;
  /** ISO instants with `Z`. Both are guaranteed present — see `isScheduleVisible`. */
  startsAt: string;
  endsAt: string;
  location: string | null;
};

/**
 * The event's own timetable: meals, workshops and ceremonies, in order.
 *
 * Read-only by design. Whether a participant was checked into a given
 * sub-event is a per-user question on an otherwise event-shaped page, and
 * showing it would turn every missed volunteer scan into "the site says I
 * didn't get lunch".
 */
export function EventSchedule({ entries }: { entries: ScheduleEntry[] }) {
  if (entries.length === 0) return null;

  const days = groupByDay(entries);
  const multiDay = days.length > 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <CalendarClock aria-hidden className='size-4' />
          Schedule
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-5'>
        {days.map((day) => (
          <div key={day.key} className='space-y-2'>
            {/* A heading only earns its place once the event spans more than
                one day; for a single-day event it just repeats the date that
                is already in every row. */}
            {multiDay && (
              <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                {day.label}
              </p>
            )}
            <ul className='divide-y rounded-lg border'>
              {day.entries.map((entry) => (
                <li key={entry.id} className='px-4 py-3'>
                  <p className='font-medium'>{entry.name}</p>
                  <p className='text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
                    <LocalDateRange
                      start={entry.startsAt}
                      end={entry.endsAt}
                      singleTimeStyle='short'
                    />
                    {entry.location && (
                      <span className='inline-flex items-center gap-1.5'>
                        <MapPin aria-hidden className='size-3.5 shrink-0' />
                        {entry.location}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Buckets entries by calendar day in the *event's* zone.
 *
 * Deliberately the venue's zone and not the viewer's: the day headings are
 * rendered on the server, where the viewer's zone isn't known, and pinning them
 * to `EVENT_TIME_ZONE` is what makes first paint identical for everyone (see
 * AGENTS.md). Known consequence: `LocalDateRange` swaps each row's times to the
 * viewer's zone after hydration, so someone reading from far enough away can
 * see a late-night row sitting under the previous day's heading. For an
 * in-person Calgary event that's the right trade — the venue's day is the one
 * that matters to anyone actually attending.
 */
function groupByDay(entries: ScheduleEntry[]) {
  const days: { key: string; label: string; entries: ScheduleEntry[] }[] = [];

  for (const entry of entries) {
    const instant = new Date(entry.startsAt);
    const key = formatInstant(instant, EVENT_TIME_ZONE, 'en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const existing = days.find((day) => day.key === key);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    days.push({
      key,
      label: formatInstant(instant, EVENT_TIME_ZONE, DEFAULT_LOCALE, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
      entries: [entry],
    });
  }

  return days;
}
