/**
 * The zone the event physically happens in. Used as the deterministic SSR
 * fallback for date rendering: first paint must be identical for every
 * viewer (some of these renders sit inside `'use cache'` boundaries, so a
 * viewer-specific zone can never be baked into the initial HTML).
 */
export const EVENT_TIME_ZONE = 'America/Edmonton';

/** Deterministic SSR/pre-hydration locale fallback for date formatting —
 *  same rationale as EVENT_TIME_ZONE: first paint must be identical for
 *  every viewer, so the real viewer locale can only be used post-hydration. */
export const DEFAULT_LOCALE = 'en-US';

/** Format an instant in an explicit zone and locale. There is deliberately
 *  no ambient overload for either — formatting without them resolves to
 *  whatever process renders the component (server or browser), which is
 *  exactly the bug this module exists to prevent. */
export function formatInstant(
  value: Date,
  timeZone: string,
  locale: string | string[],
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
    value,
  );
}

/**
 * Revive an instant from a Date or a serialized string.
 *
 * Accepts every spelling that reaches the client: ISO with `Z` or an
 * offset, the space-separated form Postgres emits, and an hour-only `+00`
 * offset. A zone-less `YYYY-MM-DDTHH:mm[:ss]` (what server actions
 * sometimes send for a UTC Date) is UTC — `new Date("2026-05-13T14:30")`
 * would otherwise bind to the viewer's zone and shift the clock.
 */
export function parseInstant(value: Date | string | null): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = TIMESTAMP_PATTERN.exec(trimmed);
  // Anything that isn't a recognizable timestamp (an RFC 2822 date, say) is
  // handed to the Date parser untouched rather than mangled on the way in.
  const date = match
    ? new Date(`${match[1]}T${match[2]}${normalizeOffset(match[3])}`)
    : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `YYYY-MM-DD`, a `T` or the space Postgres emits, a time, and an optional
 *  zone in any of the spellings Postgres and ISO 8601 between them produce:
 *  `Z`, `+00`, `+0000`, `+00:00`. */
const TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Zone suffix -> the `±HH:MM`/`Z` spelling `new Date` actually accepts.
 *
 * A missing zone means UTC: `new Date("2026-09-14 22:00:00")` would
 * otherwise bind to the viewer's zone and show 10pm MDT for a 4pm check-in.
 * The hour-only `+00` Postgres emits has to be padded — it parses in the
 * space-separated form via the engine's lenient fallback parser, but once
 * the value looks like ISO (`...T22:00:00+00`) the strict parser takes over
 * and rejects a bare two-digit offset as invalid.
 */
function normalizeOffset(offset: string | undefined): string {
  if (!offset) return 'Z';
  if (offset === 'Z' || offset === 'z') return 'Z';
  if (offset.length === 3) return `${offset}:00`; // +HH
  if (offset.length === 5) return `${offset.slice(0, 3)}:${offset.slice(3)}`; // +HHMM
  return offset; // +HH:MM
}

/** Instant -> ISO string with `Z`, for anything that crosses to the client. */
export function serializeInstant(value: Date): string;
export function serializeInstant(value: Date | null): string | null;
export function serializeInstant(value: Date | null): string | null {
  if (value == null || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

/**
 * Venue wall-clock for display. Formatted here (UTC instant + explicit
 * America/Edmonton) so a client that revives the ISO string as local 22:00
 * cannot show 10pm for a 4pm check-in.
 */
export function formatEventDateTime(value: Date): string {
  const text = formatInstant(value, EVENT_TIME_ZONE, DEFAULT_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${text} ${timeZoneAbbreviation(EVENT_TIME_ZONE, value)}`;
}

/** "MDT" | "EST" | "GMT+5:30" — evaluated *at* the given instant, so a
 *  December date correctly reads MST while an October one reads MDT. */
export function timeZoneAbbreviation(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(at);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
}

/**
 * Instant -> "YYYY-MM-DDTHH:mm:ss±HH:MM", the wall clock in `timeZone`
 * followed by that zone's offset *at that instant* (so a September date
 * gets -06:00 and a December one -07:00).
 *
 * For APIs that read the wall-clock portion and the offset as separate
 * facts rather than resolving the instant. Google Wallet's
 * `EventDateTime.start`/`end` are the case this exists for: the docs
 * define the offset-less portion as "the local date/time at the venue" and
 * Google renders exactly those digits without converting, so handing it
 * `toISOString()` puts UTC on the card face — a 2:30pm MDT event shows as
 * 8:30pm. The offset is still sent, since dropping it disables Google's
 * time-based features (notifications, sorting by start time).
 */
export function toZonedOffsetString(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    // `hour12: false` can render midnight as hour 24 in some ICU versions;
    // h23 is the spelling that always means 00-23.
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'longOffset',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';

  // "GMT-06:00" -> "-06:00". UTC formats as a bare "GMT" with no offset.
  const offset = part('timeZoneName').replace('GMT', '') || '+00:00';

  return (
    `${part('year')}-${part('month')}-${part('day')}` +
    `T${part('hour')}:${part('minute')}:${part('second')}${offset}`
  );
}

/** Instant -> "YYYY-MM-DDTHH:mm" in the browser's own zone, for a
 *  `datetime-local` input's value. Browser-only (uses the local getters). */
export function toDateTimeLocalValue(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = value.getFullYear();
  const month = pad(value.getMonth() + 1);
  const day = pad(value.getDate());
  const hours = pad(value.getHours());
  const minutes = pad(value.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/** "YYYY-MM-DDTHH:mm" (browser-local wall clock, from a `datetime-local`
 *  input) -> instant. Returns null instead of an Invalid Date for a
 *  malformed or empty string. */
export function fromDateTimeLocalValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
