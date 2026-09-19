import { describe, expect, test } from 'vitest';

import { getOverviewRsvpStatCopy } from '@/app/dashboard/admin/events/[eventId]/@overview/overview-rsvp-stat-copy';
import type { AdminRsvpSummary } from '@/app/dashboard/admin/events/actions';

function summary(
  overrides: Partial<AdminRsvpSummary> & Pick<AdminRsvpSummary, 'lifecycle'>,
): AdminRsvpSummary {
  return {
    eventId: 'event-1',
    hasApplication: true,
    capacity: 200,
    attendeeCount: 173,
    availableSpots: 27,
    eligibleApplicantCount: 11,
    eventHasStarted: false,
    latestWave: null,
    previousWaves: [],
    ...overrides,
  };
}

const wave = {
  id: 'wave-4',
  wave: 4,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  respondBy: new Date('2026-03-03T00:00:00.000Z'),
  isActive: true,
  invitedCount: 20,
  acceptedCount: 5,
  declinedCount: 2,
  timedOutCount: 2,
  waitingCount: 11,
  participants: [],
};

describe('getOverviewRsvpStatCopy', () => {
  test('no wave has started', () => {
    expect(getOverviewRsvpStatCopy(summary({ lifecycle: 'no_waves' }))).toEqual(
      expect.objectContaining({
        headline: 'Not started',
        subline: 'No wave sent yet',
        showRemaining: false,
      }),
    );
  });

  test('active wave shows number, waiting, and remaining deadline', () => {
    expect(
      getOverviewRsvpStatCopy(
        summary({ lifecycle: 'active_wave', latestWave: wave }),
      ),
    ).toEqual(
      expect.objectContaining({
        headline: 'Wave 4',
        subline: '11 waiting',
        showRemaining: true,
        waitingCount: 11,
        respondBy: wave.respondBy,
      }),
    );
  });

  test('closed wave pending the next send', () => {
    expect(
      getOverviewRsvpStatCopy(
        summary({
          lifecycle: 'awaiting_scheduled_wave',
          latestWave: { ...wave, isActive: false },
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        headline: 'Wave 4 closed',
        subline: 'Next wave pending',
        showRemaining: false,
      }),
    );
  });

  test('event full is prioritized over wave details', () => {
    expect(
      getOverviewRsvpStatCopy(
        summary({
          lifecycle: 'event_full',
          attendeeCount: 200,
          availableSpots: 0,
          latestWave: wave,
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        headline: '200 / 200',
        subline: 'Event full',
      }),
    );
  });

  test('event started uses existing lifecycle copy', () => {
    expect(
      getOverviewRsvpStatCopy(
        summary({
          lifecycle: 'event_started',
          eventHasStarted: true,
          latestWave: wave,
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        headline: 'Wave 4',
        subline: 'Event started',
      }),
    );
  });
});
