import { EVENT_TIME_ZONE } from '@/lib/datetime';

/** Calgary local deadline for RSVP invitation email copy. */
export function formatRsvpDeadline(
  date: Date,
  timeZone: string = EVENT_TIME_ZONE,
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
