/**
 * UI labels and badge variants for application_statuses (pending_review, approved,
 * denied, waitlisted). Used by events list and apply page.
 */

export type ApplicationStatusLabel =
  | 'pending_review'
  | 'approved'
  | 'denied'
  | 'waitlisted';

export const DEFAULT_APPLICATION_STATUS: ApplicationStatusLabel =
  'pending_review';

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
    description: "You're on the waitlist. We'll reach out if a spot opens up.",
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

/** Normalize DB label, null -> pending_review. */
export function resolveApplicationStatusKey(
  statusKey: string | null | undefined,
): ApplicationStatusLabel {
  if (statusKey && statusKey in DISPLAY) {
    return statusKey as ApplicationStatusLabel;
  }
  return DEFAULT_APPLICATION_STATUS;
}

/** Display config for a status label, null -> pending_review. */
export function getApplicationStatusDisplay(
  statusKey: ApplicationStatusLabel | null | undefined,
): ApplicationStatusDisplay {
  return DISPLAY[resolveApplicationStatusKey(statusKey)];
}

/** Labels for application timeline fields shown in the status banner. */
export const APPLICATION_TIMELINE_LABELS = {
  submitted: 'Submitted',
  decisionMade: 'Decision made',
} as const;

type ApplicationTimelineSource = {
  createdAt: Date;
  reviewedAt: Date | null;
};

/** Timeline fields rendered in the status card (label + date source). */
export const APPLICATION_TIMELINE_FIELDS = [
  {
    key: 'submitted',
    label: APPLICATION_TIMELINE_LABELS.submitted,
    getDate: (source: ApplicationTimelineSource) => source.createdAt,
  },
  {
    key: 'decisionMade',
    label: APPLICATION_TIMELINE_LABELS.decisionMade,
    getDate: (source: ApplicationTimelineSource) => source.reviewedAt,
  },
] as const;

/** Status title for badges; appends waitlist position when waitlisted. */
export function getApplicationStatusLabel(
  statusKey: ApplicationStatusLabel | null | undefined,
  waitlistPosition: number | null | undefined,
): string {
  const resolved = resolveApplicationStatusKey(statusKey);
  const display = getApplicationStatusDisplay(resolved);
  if (resolved === 'waitlisted' && waitlistPosition != null) {
    return `${display.title} #${waitlistPosition}`;
  }
  return display.title;
}
