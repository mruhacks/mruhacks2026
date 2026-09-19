import type { AdminRsvpSummary } from '@/app/dashboard/admin/events/actions';

export type OverviewRsvpStatCopy = {
  headline: string;
  subline: string;
  showRemaining: boolean;
  waitingCount: number | null;
  respondBy: Date | string | null;
};

function waveLabel(wave: number): string {
  return `Wave ${wave}`;
}

export function getOverviewRsvpStatCopy(
  summary: AdminRsvpSummary,
): OverviewRsvpStatCopy {
  const wave = summary.latestWave;

  switch (summary.lifecycle) {
    case 'no_waves':
      return {
        headline: 'Not started',
        subline: 'No wave sent yet',
        showRemaining: false,
        waitingCount: null,
        respondBy: null,
      };
    case 'event_full':
      return {
        headline: `${summary.attendeeCount} / ${summary.capacity ?? summary.attendeeCount}`,
        subline: 'Event full',
        showRemaining: false,
        waitingCount: null,
        respondBy: null,
      };
    case 'active_wave':
      return {
        headline: wave ? waveLabel(wave.wave) : 'RSVP',
        subline: wave ? `${wave.waitingCount} waiting` : 'In progress',
        showRemaining: Boolean(wave),
        waitingCount: wave?.waitingCount ?? null,
        respondBy: wave?.respondBy ?? null,
      };
    case 'awaiting_scheduled_wave':
      return {
        headline: wave ? `${waveLabel(wave.wave)} closed` : 'Wave closed',
        subline: 'Next wave pending',
        showRemaining: false,
        waitingCount: null,
        respondBy: null,
      };
    case 'event_started':
      return {
        headline: wave ? waveLabel(wave.wave) : 'Closed',
        subline: 'Event started',
        showRemaining: false,
        waitingCount: null,
        respondBy: null,
      };
    case 'no_eligible_applicants':
      return {
        headline: wave ? `${waveLabel(wave.wave)} closed` : 'Closed',
        subline: 'No more to invite',
        showRemaining: false,
        waitingCount: null,
        respondBy: null,
      };
    default:
      return {
        headline: '—',
        subline: 'Unavailable',
        showRemaining: false,
        waitingCount: null,
        respondBy: null,
      };
  }
}
