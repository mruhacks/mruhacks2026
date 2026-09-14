import type {
  ApplicationStatus,
  ApplicationStatusBadgeVariant,
  RsvpStatus,
} from '@/types/lookups';

/**
 * Dashboard / listing badge presentation derived from application status
 * plus RSVP status. RSVP is the status of record whenever an invitation
 * exists — same precedence as the event detail page (`RsvpStatusCard`
 * vs `ApplicationStatusBanner`).
 */

export type EventDisplayPill =
  | ApplicationStatus
  | 'rsvp_pending'
  | 'rsvp_accepted'
  | 'rsvp_declined'
  | 'rsvp_expired'
  | 'registered'
  | 'open_to_apply'
  | 'registration_open';

export type EventDisplayStatus = {
  label: string;
  pill: EventDisplayPill;
  badgeVariant: ApplicationStatusBadgeVariant;
};

export type ApplicationDisplayStatusInput = {
  hasApplication: boolean;
  userStatus: 'applied' | 'registered' | null;
  statusKey: ApplicationStatus | null;
  statusDisplay: {
    title: string;
    variant: ApplicationStatusBadgeVariant;
  } | null;
  rsvpStatusLabel: RsvpStatus | null;
  rsvpStatusDisplay: {
    title: string;
    variant: ApplicationStatusBadgeVariant;
  } | null;
};

/** Dashboard labels for RSVP states. Pending uses action-required copy. */
export const RSVP_DASHBOARD_LABELS: Record<RsvpStatus, string> = {
  pending: 'RSVP Required',
  accepted: 'RSVP Confirmed',
  declined: 'RSVP Declined',
  timed_out: 'RSVP Expired',
};

const RSVP_PILL: Record<RsvpStatus, EventDisplayPill> = {
  pending: 'rsvp_pending',
  accepted: 'rsvp_accepted',
  declined: 'rsvp_declined',
  timed_out: 'rsvp_expired',
};

const RSVP_BADGE_VARIANT: Record<RsvpStatus, ApplicationStatusBadgeVariant> = {
  pending: 'default',
  accepted: 'success',
  declined: 'destructive',
  timed_out: 'secondary',
};

export function getApplicationDisplayStatus(
  input: ApplicationDisplayStatusInput,
): EventDisplayStatus {
  if (input.rsvpStatusLabel) {
    return {
      label: RSVP_DASHBOARD_LABELS[input.rsvpStatusLabel],
      pill: RSVP_PILL[input.rsvpStatusLabel],
      badgeVariant:
        input.rsvpStatusDisplay?.variant ??
        RSVP_BADGE_VARIANT[input.rsvpStatusLabel],
    };
  }

  if (input.statusKey && input.statusDisplay) {
    return {
      label: input.statusDisplay.title,
      pill: input.statusKey,
      badgeVariant: input.statusDisplay.variant,
    };
  }

  if (input.userStatus === 'registered') {
    return {
      label: 'Registered',
      pill: 'registered',
      badgeVariant: 'default',
    };
  }

  if (input.hasApplication) {
    return {
      label: 'Open to apply',
      pill: 'open_to_apply',
      badgeVariant: 'success',
    };
  }

  return {
    label: 'Registration open',
    pill: 'registration_open',
    badgeVariant: 'success',
  };
}
