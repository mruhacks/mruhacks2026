export const EVENT_AT_CAPACITY_MESSAGE =
  'This event is at capacity. Your RSVP could not be accepted.';

export const RSVP_USER_DECISIONS = ['accepted', 'declined'] as const;
export type RsvpUserDecision = (typeof RSVP_USER_DECISIONS)[number];

export function isRsvpUserDecision(
  value: string,
): value is RsvpUserDecision {
  return (RSVP_USER_DECISIONS as readonly string[]).includes(value);
}
