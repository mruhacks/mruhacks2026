export function isSubeventRunning(
  row: { startsAt: Date | null; endsAt: Date | null },
  now: number = Date.now(),
): boolean {
  if (!row.startsAt || row.startsAt.getTime() > now) return false;
  return !row.endsAt || row.endsAt.getTime() > now;
}
