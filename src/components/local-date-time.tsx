'use client';

import { useIsHydrated } from '@/lib/use-is-hydrated';
import {
  DEFAULT_LOCALE,
  EVENT_TIME_ZONE,
  formatInstant,
  parseInstant,
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

/**
 * Same SSR/hydration split as useDisplayTimeZone, but for locale: en-US
 * during SSR and the hydration render, then the viewer's own browser
 * locale from the first post-hydration render onward.
 */
export function useDisplayLocale(): string {
  const isHydrated = useIsHydrated();
  return isHydrated ? navigator.language : DEFAULT_LOCALE;
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
  return parseInstant(value);
}

export function LocalDateTime({
  value,
  dateStyle = 'medium',
  timeStyle,
  timeZone: timeZoneProp,
  timeZoneName,
  weekday,
  className,
}: {
  value: Date | string | null;
  dateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
  timeStyle?: Intl.DateTimeFormatOptions['timeStyle'];
  /** Optional explicit zone; otherwise localizes after hydration. */
  timeZone?: string;
  timeZoneName?: Intl.DateTimeFormatOptions['timeZoneName'];
  weekday?: Intl.DateTimeFormatOptions['weekday'];
  className?: string;
}) {
  const locale = useDisplayLocale();
  const displayTimeZone = useDisplayTimeZone();
  const timeZone = timeZoneProp ?? displayTimeZone;
  const date = toDate(value);
  if (!date) return null;

  const text = formatInstant(
    date,
    timeZone,
    locale,
    weekday
      ? {
          weekday,
          ...(timeStyle
            ? ({ hour: 'numeric', minute: '2-digit' } as const)
            : {}),
        }
      : { dateStyle, timeStyle },
  );
  // dateStyle/timeStyle cannot be mixed with timeZoneName in Intl.
  const labeled =
    timeZoneName === 'short'
      ? `${text} ${timeZoneAbbreviation(timeZone, date)}`
      : text;

  return (
    <time dateTime={date.toISOString()} className={className}>
      {labeled}
    </time>
  );
}

/** Event ranges always include their times, including same-day ranges. */
export function LocalDateRange({
  start,
  end,
  dateStyle = 'medium',
  singleDateStyle,
  singleTimeStyle = 'short',
  weekday,
  timeOnly = false,
  className,
}: {
  start: Date | string | null;
  end: Date | string | null;
  dateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
  singleDateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
  singleTimeStyle?: Intl.DateTimeFormatOptions['timeStyle'];
  weekday?: Intl.DateTimeFormatOptions['weekday'];
  /** For rows under a weekday heading; overnight ends still name their day. */
  timeOnly?: boolean;
  className?: string;
}) {
  const locale = useDisplayLocale();
  const timeZone = useDisplayTimeZone();
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate) return <span className={className}>Date TBA</span>;

  const options: Intl.DateTimeFormatOptions = weekday
    ? { weekday, hour: 'numeric', minute: '2-digit' }
    : { dateStyle: singleDateStyle ?? dateStyle, timeStyle: singleTimeStyle };
  const startText = formatInstant(
    startDate,
    timeZone,
    locale,
    timeOnly ? { timeStyle: singleTimeStyle } : options,
  );
  const sameDay =
    endDate &&
    formatInstant(startDate, timeZone, 'en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }) ===
      formatInstant(endDate, timeZone, 'en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

  return (
    <span className={className}>
      <time dateTime={startDate.toISOString()}>{startText}</time>
      {endDate && endDate.getTime() !== startDate.getTime() && (
        <>
          {' – '}
          <time dateTime={endDate.toISOString()}>
            {formatInstant(
              endDate,
              timeZone,
              locale,
              sameDay
                ? { timeStyle: singleTimeStyle }
                : timeOnly
                  ? { weekday: 'long', hour: 'numeric', minute: '2-digit' }
                  : options,
            )}
          </time>
        </>
      )}
    </span>
  );
}
