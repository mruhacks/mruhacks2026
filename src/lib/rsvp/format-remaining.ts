export function formatRemaining(respondBy: Date, now: Date): string | null {
  const remainingMs = respondBy.getTime() - now.getTime();
  if (remainingMs <= 0) return null;
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Live attendee countdown until a deadline. Returns null once the deadline
 * has passed. Uses days when at least 24h remain; otherwise hours and minutes.
 */
export function formatLiveCountdown(deadline: Date, now: Date): string | null {
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs <= 0) return null;
  const totalSeconds = Math.max(1, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days >= 1) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours >= 1) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes >= 1) {
    return `${minutes}m`;
  }
  return `${totalSeconds}s`;
}
