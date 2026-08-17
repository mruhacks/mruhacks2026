import { EVENT_TIMEZONE } from '@/content';

const DATETIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const HAS_EXPLICIT_OFFSET_RE = /(?:Z|[+-]\d{2}:\d{2})$/i;

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  return Number(parts.find((part) => part.type === type)?.value);
}

function zonedPartsAsUtcMillis(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Date.UTC(
    partValue(parts, 'year'),
    partValue(parts, 'month') - 1,
    partValue(parts, 'day'),
    partValue(parts, 'hour'),
    partValue(parts, 'minute'),
    partValue(parts, 'second'),
  );
}

/**
 * Interpret a `datetime-local` value (`YYYY-MM-DDTHH:mm`) as wall-clock time
 * in `timeZone` and return the corresponding absolute `Date`.
 *
 * Does not use the Node process timezone.
 */
export function parseDateTimeLocalInTimeZone(
  value: string,
  timeZone: string = EVENT_TIMEZONE,
): Date {
  const match = DATETIME_LOCAL_RE.exec(value.trim());
  if (!match) return new Date(Number.NaN);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = zonedPartsAsUtcMillis(new Date(utcGuess), timeZone) - utcGuess;
  const corrected = utcGuess - offset;
  const offset2 =
    zonedPartsAsUtcMillis(new Date(corrected), timeZone) - corrected;
  return new Date(utcGuess - offset2);
}

/**
 * Parse an RSVP deadline from the admin form or an ISO instant.
 * Timezone-less `datetime-local` strings are Calgary (`EVENT_TIMEZONE`) wall
 * time. Strings with `Z` or an offset are absolute instants.
 */
export function parseRsvpDeadline(
  raw: string,
  timeZone: string = EVENT_TIMEZONE,
): Date {
  const trimmed = raw.trim();
  if (HAS_EXPLICIT_OFFSET_RE.test(trimmed)) {
    return new Date(trimmed);
  }
  if (DATETIME_LOCAL_RE.test(trimmed)) {
    return parseDateTimeLocalInTimeZone(trimmed, timeZone);
  }
  return new Date(trimmed);
}

export function formatRsvpDateTime(
  date: Date,
  timeZone: string = EVENT_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function formatRsvpDeadline(
  date: Date,
  timeZone: string = EVENT_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}
