/** `respond_by = createdAt + events.rsvp_response_window_hours`. */
export function computeRsvpRespondBy(
  createdAt: Date,
  windowHours: number,
): Date {
  return new Date(createdAt.getTime() + windowHours * 60 * 60 * 1000);
}

export function isRsvpWaveActive(
  respondBy: Date,
  now: Date = new Date(),
): boolean {
  return respondBy.getTime() > now.getTime();
}
