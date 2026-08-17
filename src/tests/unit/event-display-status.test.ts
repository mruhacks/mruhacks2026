import { describe, expect, test } from 'vitest';

import { getApplicationDisplayStatus } from '@/app/dashboard/events/event-display-status';
import type { ApplicationDisplayStatusInput } from '@/app/dashboard/events/event-display-status';

const acceptedApplication = {
  title: 'Accepted',
  variant: 'success' as const,
};

const pendingReview = {
  title: 'Under review',
  variant: 'warning' as const,
};

const waitlisted = {
  title: 'Waitlisted',
  variant: 'secondary' as const,
};

const denied = {
  title: 'Not accepted',
  variant: 'destructive' as const,
};

function applied(
  overrides: Partial<ApplicationDisplayStatusInput> = {},
): ApplicationDisplayStatusInput {
  return {
    hasApplication: true,
    userStatus: 'applied',
    statusKey: 'approved',
    statusDisplay: acceptedApplication,
    rsvpStatusLabel: null,
    rsvpStatusDisplay: null,
    ...overrides,
  };
}

describe('getApplicationDisplayStatus', () => {
  test('accepted application with pending RSVP → RSVP Required', () => {
    const result = getApplicationDisplayStatus(
      applied({
        rsvpStatusLabel: 'pending',
        rsvpStatusDisplay: {
          title: 'RSVP Invited',
          variant: 'default',
        },
      }),
    );
    expect(result.label).toBe('RSVP Required');
    expect(result.pill).toBe('rsvp_pending');
    expect(result.badgeVariant).toBe('default');
  });

  test('accepted application with confirmed RSVP → RSVP Confirmed', () => {
    const result = getApplicationDisplayStatus(
      applied({
        rsvpStatusLabel: 'accepted',
        rsvpStatusDisplay: {
          title: 'RSVP Accepted',
          variant: 'success',
        },
      }),
    );
    expect(result.label).toBe('RSVP Confirmed');
    expect(result.pill).toBe('rsvp_accepted');
    expect(result.badgeVariant).toBe('success');
  });

  test('accepted application with declined RSVP → RSVP Declined', () => {
    const result = getApplicationDisplayStatus(
      applied({
        rsvpStatusLabel: 'declined',
        rsvpStatusDisplay: {
          title: 'RSVP Declined',
          variant: 'destructive',
        },
      }),
    );
    expect(result.label).toBe('RSVP Declined');
    expect(result.pill).toBe('rsvp_declined');
    expect(result.badgeVariant).toBe('destructive');
  });

  test('accepted application without RSVP → Accepted', () => {
    const result = getApplicationDisplayStatus(applied());
    expect(result.label).toBe('Accepted');
    expect(result.pill).toBe('approved');
    expect(result.badgeVariant).toBe('success');
  });

  test('timed-out RSVP → RSVP Expired', () => {
    const result = getApplicationDisplayStatus(
      applied({
        rsvpStatusLabel: 'timed_out',
        rsvpStatusDisplay: {
          title: 'RSVP Expired',
          variant: 'secondary',
        },
      }),
    );
    expect(result.label).toBe('RSVP Expired');
    expect(result.pill).toBe('rsvp_expired');
    expect(result.badgeVariant).toBe('secondary');
  });

  test('RSVP takes precedence over a non-accepted application status', () => {
    const result = getApplicationDisplayStatus(
      applied({
        statusKey: 'waitlisted',
        statusDisplay: waitlisted,
        rsvpStatusLabel: 'pending',
        rsvpStatusDisplay: { title: 'RSVP Invited', variant: 'default' },
      }),
    );
    expect(result.label).toBe('RSVP Required');
  });

  test('pending_review continues to show Under review', () => {
    const result = getApplicationDisplayStatus(
      applied({
        statusKey: 'pending_review',
        statusDisplay: pendingReview,
      }),
    );
    expect(result.label).toBe('Under review');
    expect(result.pill).toBe('pending_review');
  });

  test('waitlisted continues to show Waitlisted', () => {
    const result = getApplicationDisplayStatus(
      applied({
        statusKey: 'waitlisted',
        statusDisplay: waitlisted,
      }),
    );
    expect(result.label).toBe('Waitlisted');
    expect(result.pill).toBe('waitlisted');
  });

  test('denied continues to show Not accepted', () => {
    const result = getApplicationDisplayStatus(
      applied({
        statusKey: 'denied',
        statusDisplay: denied,
      }),
    );
    expect(result.label).toBe('Not accepted');
    expect(result.pill).toBe('denied');
  });

  test('registered events without an application show Registered', () => {
    const result = getApplicationDisplayStatus({
      hasApplication: false,
      userStatus: 'registered',
      statusKey: null,
      statusDisplay: null,
      rsvpStatusLabel: null,
      rsvpStatusDisplay: null,
    });
    expect(result.label).toBe('Registered');
    expect(result.pill).toBe('registered');
  });
});
