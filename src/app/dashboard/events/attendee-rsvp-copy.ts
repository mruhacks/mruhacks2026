import type { RsvpStatus } from '@/types/lookups';

/** Attendee-facing body copy for the event-page RSVP card. */
export function getAttendeeRsvpCardDescription(
  statusLabel: RsvpStatus,
  eventName: string,
): string {
  switch (statusLabel) {
    case 'pending':
      return 'Your application was accepted. Please confirm whether you will attend.';
    case 'accepted':
      return `Your spot is confirmed. We'll see you at ${eventName}.`;
    case 'declined':
      return 'You declined your spot.';
    case 'timed_out':
      return 'Your RSVP window has ended.';
  }
}
