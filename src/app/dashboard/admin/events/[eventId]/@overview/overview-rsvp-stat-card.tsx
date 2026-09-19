'use client';

import type { AdminRsvpSummary } from '@/app/dashboard/admin/events/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRemaining, toDate } from '@/lib/rsvp/format-remaining';
import { useIsHydrated } from '@/lib/use-is-hydrated';

import { getOverviewRsvpStatCopy } from './overview-rsvp-stat-copy';

type OverviewRsvpStatCardProps = {
  summary: AdminRsvpSummary | null;
  loading: boolean;
};

function ActiveWaveSubtitle({
  waitingCount,
  respondBy,
}: {
  waitingCount: number;
  respondBy: Date | string;
}) {
  const hydrated = useIsHydrated();
  const remaining = hydrated
    ? formatRemaining(toDate(respondBy), new Date())
    : null;

  if (!remaining) {
    return (
      <p className='text-muted-foreground mt-1 text-xs'>
        {waitingCount} waiting
      </p>
    );
  }

  return (
    <p className='text-muted-foreground mt-1 text-xs'>
      {waitingCount} waiting · ~{remaining} left
    </p>
  );
}

function RsvpStatBody({ summary }: { summary: AdminRsvpSummary }) {
  const copy = getOverviewRsvpStatCopy(summary);

  if (
    copy.showRemaining &&
    copy.respondBy != null &&
    copy.waitingCount != null
  ) {
    return (
      <>
        <div className='text-2xl font-bold'>{copy.headline}</div>
        <ActiveWaveSubtitle
          waitingCount={copy.waitingCount}
          respondBy={copy.respondBy}
        />
      </>
    );
  }

  return (
    <>
      <div className='text-2xl font-bold'>{copy.headline}</div>
      <p className='text-muted-foreground mt-1 text-xs'>{copy.subline}</p>
    </>
  );
}

export function OverviewRsvpStatCard({
  summary,
  loading,
}: OverviewRsvpStatCardProps) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-muted-foreground text-sm font-medium'>
          RSVP
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading || !summary ? (
          <>
            <div className='text-2xl font-bold'>—</div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {loading ? 'Loading' : 'Unavailable'}
            </p>
          </>
        ) : (
          <RsvpStatBody summary={summary} />
        )}
      </CardContent>
    </Card>
  );
}
