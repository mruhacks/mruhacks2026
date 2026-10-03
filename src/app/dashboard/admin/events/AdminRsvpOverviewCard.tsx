'use client';

import type {
  AdminRsvpLifecycle,
  AdminRsvpSummary,
} from '@/app/dashboard/admin/events/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsHydrated } from '@/lib/use-is-hydrated';
import { formatRemaining, toDate } from '@/lib/rsvp/format-remaining';

const LIFECYCLE_COPY: Record<AdminRsvpLifecycle, string> = {
  no_application: '',
  no_waves: 'No waves have been sent yet.',
  active_wave: '',
  awaiting_scheduled_wave:
    'The current wave has closed. The next wave can send now.',
  event_full: 'The event is full. No further waves will be sent.',
  no_eligible_applicants: 'No more applicants are waiting to be invited.',
  event_started: 'The event has started. Waves can no longer be sent.',
};

function CapacityLine({ summary }: { summary: AdminRsvpSummary }) {
  if (summary.capacity == null) {
    return (
      <p className='text-2xl font-bold'>
        {summary.attendeeCount} attending{' '}
        <span className='text-muted-foreground text-sm font-medium'>
          · Unlimited capacity
        </span>
      </p>
    );
  }

  const remaining = Math.max(0, summary.capacity - summary.attendeeCount);

  return (
    <div className='flex flex-col gap-1'>
      <p className='text-2xl font-bold'>
        {summary.attendeeCount} / {summary.capacity} attending
      </p>
      <p className='text-muted-foreground text-sm'>
        {remaining} spot{remaining === 1 ? '' : 's'} remaining
      </p>
    </div>
  );
}

function NextWaveCopy({ summary }: { summary: AdminRsvpSummary }) {
  const copy = LIFECYCLE_COPY[summary.lifecycle];
  if (!copy) return null;
  return <p className='text-sm'>{copy}</p>;
}

function RemainingLabel({ respondBy }: { respondBy: Date | string }) {
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;
  const remaining = formatRemaining(toDate(respondBy), new Date());
  if (!remaining) return null;
  return (
    <p className='text-muted-foreground text-xs'>
      Next wave after ~{remaining}
    </p>
  );
}

type Props = {
  summary: AdminRsvpSummary | null;
  loading: boolean;
  error: string | null;
};

export function AdminRsvpOverviewCard({ summary, loading, error }: Props) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>RSVP Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>RSVP Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!summary || !summary.hasApplication) {
    return null;
  }

  const latestWave = summary.latestWave;

  return (
    <Card>
      <CardHeader>
        <CardTitle>RSVP Overview</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        <CapacityLine summary={summary} />
        <NextWaveCopy summary={summary} />
        {latestWave?.isActive && (
          <RemainingLabel respondBy={latestWave.respondBy} />
        )}
      </CardContent>
    </Card>
  );
}
