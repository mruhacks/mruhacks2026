import {
  participationStatusDisplayList,
  participationStatusesList,
  type ParticipationStatus,
  type StatusBadgeVariant,
} from '@/types/lookups';

/**
 * The participation lifecycle, as pure functions shared by server and client.
 * There is one status per (event, user) — see the registration flow in
 * docs/ARCHITECTURE.md. Nothing outside this module should re-derive what a
 * status means (who's attending, who may form a team, what an expired
 * invitation reads as).
 */

/** Review outcomes: what an organizer decides before any invitation. */
const REVIEW_STATUSES = [
  'pending_review',
  'waitlisted',
  'denied',
] as const satisfies readonly ParticipationStatus[];

/** Outcomes of an RSVP invitation. Only reachable once one has been sent. */
const INVITATION_STATUSES = [
  'invited',
  'accepted',
  'declined',
  'timed_out',
] as const satisfies readonly ParticipationStatus[];
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * Statuses an RSVP wave draws from. Accepting an application puts it on the
 * waitlist; waves invite from there in `waitlist_position` order.
 */
export const WAVE_ELIGIBLE_STATUSES = [
  'waitlisted',
] as const satisfies readonly ParticipationStatus[];

export function isReviewStatus(status: ParticipationStatus): boolean {
  return (REVIEW_STATUSES as readonly string[]).includes(status);
}

export function isInvitationStatus(
  status: ParticipationStatus,
): status is InvitationStatus {
  return (INVITATION_STATUSES as readonly string[]).includes(status);
}

/** Normalize a stored `participation_statuses.label`. Unknown / null → pending_review. */
export function resolveStoredStatus(
  label: string | null | undefined,
): ParticipationStatus {
  if (
    label &&
    (participationStatusesList as readonly string[]).includes(label)
  ) {
    return label as ParticipationStatus;
  }
  return 'pending_review';
}

/**
 * Effective status for reads and business rules.
 *
 * A stored `invited` whose invitation deadline is in the past is `timed_out`,
 * even before `timeoutExpiredInvitations` has persisted that. Every other
 * status is final until someone changes it.
 */
export function resolveEffectiveStatus(
  label: string | null | undefined,
  respondBy: Date | null | undefined,
  now: Date = new Date(),
): ParticipationStatus {
  const stored = resolveStoredStatus(label);
  if (
    stored === 'invited' &&
    respondBy &&
    respondBy.getTime() < now.getTime()
  ) {
    return 'timed_out';
  }
  return stored;
}

/** Holding a spot: counts against capacity, gets a pass, can be checked in. */
export function isAttending(status: ParticipationStatus): boolean {
  return status === 'accepted';
}

/**
 * Still in the running (or already in): may plan a team. A waitlisted or
 * not-yet-reviewed applicant can line up teammates; anyone turned away or
 * who has given up their spot can't.
 */
export function canFormTeam(status: ParticipationStatus): boolean {
  return status !== 'denied' && status !== 'declined' && status !== 'timed_out';
}

/** Application answers stay editable only until a review decision is made. */
export function canEditApplication(status: ParticipationStatus): boolean {
  return status === 'pending_review';
}

/** Checked-in / no-show are derived from attendance, never stored. */
export type AttendanceState = 'checked_in' | 'no_show';

export function deriveAttendance(input: {
  status: ParticipationStatus;
  checkedIn: boolean;
  eventEndsAt: Date | null;
  now?: Date;
}): AttendanceState | null {
  if (!isAttending(input.status)) return null;
  if (input.checkedIn) return 'checked_in';
  const now = input.now ?? new Date();
  if (input.eventEndsAt && input.eventEndsAt.getTime() < now.getTime()) {
    return 'no_show';
  }
  return null;
}

export type StatusDisplay = {
  title: string;
  description: string;
  variant: StatusBadgeVariant;
};

/**
 * Seeded display config, for client components that can't read the
 * `participation_statuses` table. Server code reads the table through
 * `getStatusDisplayMap`.
 */
export const STATIC_STATUS_DISPLAY = Object.fromEntries(
  participationStatusDisplayList.map(({ label, ...display }) => [
    label,
    display,
  ]),
) as Record<ParticipationStatus, StatusDisplay>;
