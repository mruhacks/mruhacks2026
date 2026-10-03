import type { ParticipationStatus, StatusBadgeVariant } from '@/types/lookups';
import {
  STATIC_STATUS_DISPLAY,
  type StatusDisplay,
} from '@/lib/participation/status';

/**
 * Dashboard / listing badge for a user and an event, derived from their one
 * participation status. The event page card and the admin roster use the
 * same titles, so a status reads identically everywhere it's shown.
 */

export type EventDisplayPill =
  ParticipationStatus | 'registered' | 'open_to_apply' | 'registration_open';

export type EventDisplayStatus = {
  label: string;
  pill: EventDisplayPill;
  badgeVariant: StatusBadgeVariant;
};

export type EventDisplayStatusInput = {
  hasApplication: boolean;
  status: ParticipationStatus | null;
  /** DB display config; falls back to the seeded copy when absent. */
  statusDisplay?: Pick<StatusDisplay, 'title' | 'variant'> | null;
};

export function getEventDisplayStatus(
  input: EventDisplayStatusInput,
): EventDisplayStatus {
  if (input.status) {
    // A signup for an event without an application is `accepted` from the
    // start; "Confirmed" would imply an RSVP they never made.
    if (!input.hasApplication && input.status === 'accepted') {
      return {
        label: 'Registered',
        pill: 'registered',
        badgeVariant: 'success',
      };
    }
    const display = input.statusDisplay ?? STATIC_STATUS_DISPLAY[input.status];
    return {
      label: display.title,
      pill: input.status,
      badgeVariant: display.variant,
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
