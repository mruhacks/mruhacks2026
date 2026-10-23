export const EVENT_AT_CAPACITY_MESSAGE = 'This event is at capacity. Your RSVP could not be accepted.';

/** Default RSVP invitation window when an event has no custom value. */
export const DEFAULT_RSVP_RESPONSE_WINDOW_HOURS = 48;

export const WAVE_ALREADY_ACTIVE_MESSAGE = 'An RSVP wave is already active for this event.';

export const WAVE_EVENT_STARTED_MESSAGE = 'Cannot send an RSVP wave after the event has started.';

export const USER_DECISIONS = ['accepted', 'declined'] as const;
export type UserDecision = (typeof USER_DECISIONS)[number];

export function isRsvpUserDecision(value: string): value is UserDecision {
  return (USER_DECISIONS as readonly string[]).includes(value);
}
