import type { ParticipationStatus } from '@/types/lookups';
import type { CorePermissionSlug as PermissionSlug } from '@/lib/rbac/permissions';
import { isInvitationStatus } from '@/lib/participation/status';

/**
 * Which status changes are allowed, and who may make them. The one table of
 * participation transitions — the admin status picker, the admin action and
 * the participant's own actions all read from here.
 */

/** The permission that governs a status: review decisions vs RSVP outcomes. */
function statusPermission(status: ParticipationStatus): PermissionSlug {
  return isInvitationStatus(status)
    ? 'rsvp:write:all'
    : 'application:review:all';
}

/**
 * The permissions an organizer needs to move a participant from `from` to
 * `to`, or null when there's nothing to change.
 *
 * Any status can be set from any other — organizers override the flow, they
 * aren't bound by it. What a move touches decides who may make it: review
 * decisions (pending_review / waitlisted / denied) need
 * `application:review:all`, RSVP outcomes (invited / accepted / declined /
 * timed_out) need `rsvp:write:all`, and a move between the two needs both.
 */
export function adminTransitionPermissions(
  from: ParticipationStatus,
  to: ParticipationStatus,
): PermissionSlug[] | null {
  if (from === to) return null;
  return [...new Set([statusPermission(from), statusPermission(to)])];
}

/**
 * Statuses an organizer holding `permissions` may move `from` to, in
 * `candidates` order.
 */
export function adminStatusOptions(
  from: ParticipationStatus,
  permissions: ReadonlySet<PermissionSlug>,
  candidates: readonly ParticipationStatus[],
): ParticipationStatus[] {
  return candidates.filter((to) => {
    const required = adminTransitionPermissions(from, to);
    return required !== null && required.every((p) => permissions.has(p));
  });
}

/** Moves a participant may make on their own. */
const PARTICIPANT_TRANSITIONS: Partial<
  Record<ParticipationStatus, readonly ParticipationStatus[]>
> = {
  // Answer the RSVP.
  invited: ['accepted', 'declined'],
  // Give up a confirmed spot (frees it for the next wave).
  accepted: ['declined'],
  // Leave the waitlist.
  waitlisted: ['declined'],
};

export function canParticipantTransition(
  from: ParticipationStatus,
  to: ParticipationStatus,
): boolean {
  return PARTICIPANT_TRANSITIONS[from]?.includes(to) ?? false;
}
