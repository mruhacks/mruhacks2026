/**
 * The zone the event physically happens in. Used as the deterministic SSR
 * fallback for date rendering: first paint must be identical for every
 * viewer (some of these renders sit inside `'use cache'` boundaries, so a
 * viewer-specific zone can never be baked into the initial HTML).
 */
export const EVENT_TIME_ZONE = 'America/Edmonton';

/** Format an instant in an explicit zone. There is deliberately no
 *  ambient-zone overload — formatting without a `timeZone` resolves to
 *  whatever process renders the component (server or browser), which is
 *  exactly the bug this module exists to prevent. */
export function formatInstant(
  value: Date,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(
    value,
  );
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
