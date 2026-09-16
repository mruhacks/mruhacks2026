const PASS_TIME_ZONE = 'America/Edmonton';

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
