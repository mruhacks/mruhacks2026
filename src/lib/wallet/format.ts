const PASS_TIME_ZONE = 'America/Edmonton';

/** Dates read the same in en-CA and en-US, but times don't: en-CA renders
 *  "9:00 a.m." where every other time in the app (`formatEventDateTime`)
 *  reads "9:00 AM". The pass follows the app. */
const TIME_LOCALE = 'en-US';

/** Shared by the Apple pass, the Google Wallet class, and the in-app ticket page. */
export function formatDateRange(
  startsAt: Date | null,
  endsAt: Date | null,
): string | null {
  if (!startsAt && !endsAt) return null;

  const dayFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: PASS_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  });
  const dayYearFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: PASS_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const yearFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: PASS_TIME_ZONE,
    year: 'numeric',
  });

  if (startsAt && endsAt) {
    // A one-day event's start and end days are the same words, so a date
    // range would read "Sep 16–Sep 16, 2026" — the hours are the only part
    // that carries information, and they're what a participant showing up
    // actually needs. The year goes instead of the times rather than beside
    // them: the pass expires within the event, and the string has to fit an
    // Apple auxiliary field sitting next to VENUE.
    if (dayYearFormat.format(startsAt) === dayYearFormat.format(endsAt)) {
      const timeFormat = new Intl.DateTimeFormat(TIME_LOCALE, {
        timeZone: PASS_TIME_ZONE,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      const start = timeFormat.format(startsAt);
      const end = timeFormat.format(endsAt);
      const day = dayFormat.format(startsAt);
      // An event stored with identical start and end shouldn't print the
      // same clock time twice.
      return start === end ? `${day}, ${start}` : `${day}, ${start}–${end}`;
    }

    // Both years must be read in PASS_TIME_ZONE, not via getFullYear() —
    // that resolves in the server process's zone, so on a UTC host an event
    // starting Dec 31 18:00 MST reads as the following year and the omitted
    // year contradicts the Edmonton date printed beside it.
    const sameYear = yearFormat.format(startsAt) === yearFormat.format(endsAt);
    const start = sameYear
      ? dayFormat.format(startsAt)
      : dayYearFormat.format(startsAt);
    return `${start}–${dayYearFormat.format(endsAt)}`;
  }

  return dayYearFormat.format((startsAt ?? endsAt) as Date);
}
