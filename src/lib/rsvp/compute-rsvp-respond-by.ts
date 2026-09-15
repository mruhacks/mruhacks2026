/**
 * Wave deadline from creation time plus the event's response window.
 * `windowHours` is the event-level setting (`rsvp_response_window_hours`).
 */
export function computeRsvpRespondBy(
  createdAt: Date,
  windowHours: number,
): Date {
  return new Date(createdAt.getTime() + windowHours * 60 * 60 * 1000);
}

/** Latest wave is still collecting responses. */
export function isRsvpWaveActive(
  respondBy: Date,
  now: Date = new Date(),
): boolean {
  return respondBy.getTime() > now.getTime();
}
