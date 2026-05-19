/**
 * UI labels and badge variants for application_statuses (pending_review, approved,
 * denied, waitlisted). Used by events list and apply page.
 */

export type ApplicationStatusLabel =
  | 'pending_review'
  | 'approved'
  | 'denied'
  | 'waitlisted';

export type ApplicationStatusBadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'outline';

export type ApplicationStatusDisplay = {
  title: string;
  description: string;
  variant: ApplicationStatusBadgeVariant;
  isFinal: boolean;
};

const DISPLAY: Record<ApplicationStatusLabel, ApplicationStatusDisplay> = {
  pending_review: {
    title: 'Under review',
    description:
      "We're reviewing your application and will email you when a decision has been made.",
    variant: 'warning',
    isFinal: false,
  },
  approved: {
    title: 'Accepted',
    description: "You're in! Check your email and ticket for next steps.",
    variant: 'success',
    isFinal: true,
  },
  waitlisted: {
    title: 'Waitlisted',
    description:
      "You're on the waitlist. We'll reach out if a spot opens up.",
    variant: 'secondary',
    isFinal: true,
  },
  denied: {
    title: 'Not accepted',
    description:
      'Thanks for applying — unfortunately we were not able to offer you a spot.',
    variant: 'destructive',
    isFinal: true,
  },
};

const SUBMITTED_FALLBACK: ApplicationStatusDisplay = {
  title: 'Application submitted',
  description:
    "Your application has been received. We'll email you when a decision has been made.",
  variant: 'outline',
  isFinal: false,
};

/** Display config for a status label; null/unknown → submitted, not yet triaged. */
export function getApplicationStatusDisplay(
  statusKey: ApplicationStatusLabel | null | undefined,
): ApplicationStatusDisplay {
  if (statusKey && statusKey in DISPLAY) {
    return DISPLAY[statusKey];
  }
  return SUBMITTED_FALLBACK;
}

/** Status title for badges; appends waitlist position when waitlisted. */
export function getApplicationStatusLabel(
  statusKey: ApplicationStatusLabel | null | undefined,
  waitlistPosition: number | null | undefined,
): string {
  const display = getApplicationStatusDisplay(statusKey);
  if (statusKey === 'waitlisted' && waitlistPosition != null) {
    return `${display.title} #${waitlistPosition}`;
  }
  return display.title;
}
