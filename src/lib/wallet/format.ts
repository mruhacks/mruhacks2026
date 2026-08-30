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

  if (startsAt && endsAt) {
    const sameYear = startsAt.getFullYear() === endsAt.getFullYear();
    const start = sameYear
      ? dayFormat.format(startsAt)
      : dayYearFormat.format(startsAt);
    return `${start}–${dayYearFormat.format(endsAt)}`;
  }

  return dayYearFormat.format((startsAt ?? endsAt) as Date);
}
