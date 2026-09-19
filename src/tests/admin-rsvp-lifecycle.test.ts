import { describe, test, expect } from 'vitest';

import { deriveAdminRsvpLifecycle } from '@/lib/rsvp/get-admin-rsvp-summary';

const now = new Date('2026-09-16T18:00:00.000Z');

describe('deriveAdminRsvpLifecycle', () => {
  test('returns no_waves when RSVP has not started', () => {
    expect(
      deriveAdminRsvpLifecycle({
        hasApplication: true,
        latestWave: null,
        isFull: false,
        eligibleApplicantCount: 3,
        eventHasStarted: false,
        now,
      }),
    ).toBe('no_waves');
  });

  test('returns active_wave while respondBy is in the future', () => {
    expect(
      deriveAdminRsvpLifecycle({
        hasApplication: true,
        latestWave: { respondBy: new Date('2026-09-18T18:00:00.000Z') },
        isFull: false,
        eligibleApplicantCount: 3,
        eventHasStarted: false,
        now,
      }),
    ).toBe('active_wave');
  });

  test('returns awaiting_scheduled_wave after a closed wave when more people can be invited', () => {
    expect(
      deriveAdminRsvpLifecycle({
        hasApplication: true,
        latestWave: { respondBy: new Date('2026-09-16T17:00:00.000Z') },
        isFull: false,
        eligibleApplicantCount: 2,
        eventHasStarted: false,
        now,
      }),
    ).toBe('awaiting_scheduled_wave');
  });

  test('returns event_full when no spots remain', () => {
    expect(
      deriveAdminRsvpLifecycle({
        hasApplication: true,
        latestWave: { respondBy: new Date('2026-09-16T17:00:00.000Z') },
        isFull: true,
        eligibleApplicantCount: 0,
        eventHasStarted: false,
        now,
      }),
    ).toBe('event_full');
  });

  test('returns no_eligible_applicants when spots remain but nobody can be invited', () => {
    expect(
      deriveAdminRsvpLifecycle({
        hasApplication: true,
        latestWave: { respondBy: new Date('2026-09-16T17:00:00.000Z') },
        isFull: false,
        eligibleApplicantCount: 0,
        eventHasStarted: false,
        now,
      }),
    ).toBe('no_eligible_applicants');
  });

  test('returns event_started after a closed wave once the event has started', () => {
    expect(
      deriveAdminRsvpLifecycle({
        hasApplication: true,
        latestWave: { respondBy: new Date('2026-09-16T17:00:00.000Z') },
        isFull: false,
        eligibleApplicantCount: 2,
        eventHasStarted: true,
        now,
      }),
    ).toBe('event_started');
  });
});
