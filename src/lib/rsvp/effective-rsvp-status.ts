import { rsvpStatusesList, type RsvpStatus } from '@/types/lookups';

const VALID_RSVP_LABELS: readonly string[] = rsvpStatusesList;

/**
 * Normalize a stored `rsvp_statuses.label`. Unknown / null → pending.
 */
export function resolveStoredRsvpStatus(
  statusKey: string | null | undefined,
): RsvpStatus {
  if (statusKey && VALID_RSVP_LABELS.includes(statusKey)) {
    return statusKey as RsvpStatus;
  }
  return 'pending';
}

/**
 * Effective RSVP status for reads and business rules.
 *
 * A stored `pending` row whose wave `respondBy` is in the past is `timed_out`,
 * even if `timeoutExpiredRsvpResponses` has not persisted that yet.
 * Accepted / declined are never rewritten by the deadline.
 */
export function resolveEffectiveRsvpStatus(
  storedLabel: string | null | undefined,
  respondBy: Date | null | undefined,
  now: Date = new Date(),
): RsvpStatus {
  const stored = resolveStoredRsvpStatus(storedLabel);
  if (
    stored === 'pending' &&
    respondBy != null &&
    respondBy.getTime() < now.getTime()
  ) {
    return 'timed_out';
  }
  return stored;
}

/** True when the invite is still open to accept/decline/resend. */
export function isEffectivePendingRsvp(
  storedLabel: string | null | undefined,
  respondBy: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return resolveEffectiveRsvpStatus(storedLabel, respondBy, now) === 'pending';
}
