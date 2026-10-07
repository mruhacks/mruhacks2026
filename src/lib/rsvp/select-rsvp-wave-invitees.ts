import type { EligibleRsvpApplicant } from '@/lib/rsvp/eligible-rsvp-applicants';

/**
 * Who to put in the next RSVP wave given remaining event capacity.
 *
 * Invite count is `min(eligible applicants, remaining spots)`. Unlimited
 * capacity (`availableSpots === null`) invites everyone eligible.
 *
 * Order: the vote-ranked waitlist `rank` (see `@/lib/rsvp/waitlist`), then
 * oldest application. `participantId` is a tie-break only so equal
 * timestamps stay deterministic.
 */
export function selectRsvpWaveInvitees(
  applicants: EligibleRsvpApplicant[],
  availableSpots: number | null,
): EligibleRsvpApplicant[] {
  const ordered = [...applicants].sort(compareEligibleRsvpApplicants);
  if (availableSpots === null) {
    return ordered;
  }
  return ordered.slice(0, Math.max(0, availableSpots));
}

function compareEligibleRsvpApplicants(
  a: EligibleRsvpApplicant,
  b: EligibleRsvpApplicant,
): number {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  const byAppliedAt =
    a.applicationCreatedAt.getTime() - b.applicationCreatedAt.getTime();
  if (byAppliedAt !== 0) {
    return byAppliedAt;
  }
  if (a.participantId < b.participantId) return -1;
  if (a.participantId > b.participantId) return 1;
  return 0;
}
