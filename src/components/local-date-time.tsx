'use client';

import { useIsHydrated } from '@/lib/use-is-hydrated';
import {
  EVENT_TIME_ZONE,
  formatInstant,
  timeZoneAbbreviation,
} from '@/lib/datetime';

/**
 * EVENT_TIME_ZONE during SSR and the hydration render (so first paint is
 * identical for every viewer — required inside `'use cache'` boundaries),
 * then the viewer's own detected zone from the first post-hydration render
 * onward. Most viewers are in the event's own zone, so this swap is usually
 * invisible; remote viewers see one quiet correction right after load.
 */
export function useDisplayTimeZone(): string {
  const isHydrated = useIsHydrated();
  return isHydrated
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : EVENT_TIME_ZONE;
}

/** Short zone abbreviation ("MDT", "MST") for a `datetime-local` field's
 *  label, e.g. "Starts At (MDT)". Evaluated at the field's current value so
 *  it tracks DST for the date being edited; falls back to "now" when the
 *  field is empty. */
export function useZoneAbbreviation(datetimeLocalValue?: string): string {
  const timeZone = useDisplayTimeZone();
  const at = datetimeLocalValue ? new Date(datetimeLocalValue) : new Date();
  return timeZoneAbbreviation(
    timeZone,
    Number.isNaN(at.getTime()) ? new Date() : at,
  );
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function LocalDateTime({
  value,
  dateStyle = 'medium',
  timeStyle,
  className,
}: {
  value: Date | string | null;
  dateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
  timeStyle?: Intl.DateTimeFormatOptions['timeStyle'];
  className?: string;
}) {
  const timeZone = useDisplayTimeZone();
  const date = toDate(value);
  if (!date) return null;

  return (
    <time dateTime={date.toISOString()} className={className}>
      {formatInstant(date, timeZone, { dateStyle, timeStyle })}
    </time>
  );
}

/** Replaces the duplicated per-file date-range formatters. Collapses to a
 *  single date when start and end render identically; "Date TBA" when
 *  start is null. `singleTimeStyle` controls how much detail shows when it
 *  collapses to that one date — e.g. a full "long" date + time, since there's
 *  no second date competing for space. */
export function LocalDateRange({
  start,
  end,
  dateStyle = 'medium',
  singleDateStyle,
  singleTimeStyle,
  className,
}: {
  start: Date | string | null;
  end: Date | string | null;
  dateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
  singleDateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
  singleTimeStyle?: Intl.DateTimeFormatOptions['timeStyle'];
  className?: string;
}) {
  const timeZone = useDisplayTimeZone();
  const startDate = toDate(start);
  if (!startDate) return <span className={className}>Date TBA</span>;

  const endDate = toDate(end);
  const startText = formatInstant(startDate, timeZone, { dateStyle });
  const endText = endDate
    ? formatInstant(endDate, timeZone, { dateStyle })
    : null;

  if (!endText || endText === startText) {
    const singleText = formatInstant(startDate, timeZone, {
      dateStyle: singleDateStyle ?? dateStyle,
      timeStyle: singleTimeStyle,
    });
    return (
      <time dateTime={startDate.toISOString()} className={className}>
        {singleText}
      </time>
    );
  }

  return (
    <span className={className}>
      <time dateTime={startDate.toISOString()}>{startText}</time>
      {' – '}
      <time dateTime={endDate!.toISOString()}>{endText}</time>
    </span>
  );
}
