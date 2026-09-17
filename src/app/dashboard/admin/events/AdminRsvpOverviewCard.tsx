'use client';

import * as React from 'react';

import type {
  AdminRsvpLifecycle,
  AdminRsvpSummary,
  AdminRsvpWaveSummary,
} from '@/app/dashboard/admin/events/actions';
import { RsvpParticipantsTable } from '@/app/dashboard/admin/events/RsvpParticipantsTable';
import { LocalDateTime } from '@/components/local-date-time';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

function WaveCounts({ wave }: { wave: AdminRsvpWaveSummary }) {
  return (
    <div className='grid grid-cols-2 gap-3 sm:grid-cols-5'>
      <CountStat label='Invited' value={wave.invitedCount} />
      <CountStat label='Accepted' value={wave.acceptedCount} />
      <CountStat label='Declined' value={wave.declinedCount} />
      <CountStat label='Timed out' value={wave.timedOutCount} />
      <CountStat label='Waiting' value={wave.waitingCount} />
    </div>
  );
}

function CountStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className='text-muted-foreground text-xs font-semibold uppercase'>
        {label}
      </p>
      <p className='mt-1 text-lg font-semibold'>{value}</p>
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
  const [historyWaveId, setHistoryWaveId] = React.useState<string | null>(null);

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
  const openHistoryWave =
    summary.previousWaves.find((wave) => wave.id === historyWaveId) ?? null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>RSVP Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <CapacityLine summary={summary} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Wave</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {latestWave ? (
            <>
              <p className='text-lg font-semibold'>Wave {latestWave.wave}</p>
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                <div>
                  <p className='text-muted-foreground text-xs font-semibold uppercase'>
                    Sent
                  </p>
                  <p className='mt-1 text-sm'>
                    <LocalDateTime
                      value={latestWave.createdAt}
                      dateStyle='medium'
                      timeStyle='short'
                    />
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground text-xs font-semibold uppercase'>
                    Closes
                  </p>
                  <p className='mt-1 text-sm'>
                    <LocalDateTime
                      value={latestWave.respondBy}
                      dateStyle='medium'
                      timeStyle='short'
                    />
                  </p>
                  {latestWave.isActive && (
                    <RemainingLabel respondBy={latestWave.respondBy} />
                  )}
                </div>
              </div>
              <NextWaveCopy summary={summary} />
              <WaveCounts wave={latestWave} />
            </>
          ) : (
            <p className='text-sm'>{LIFECYCLE_COPY.no_waves}</p>
          )}
        </CardContent>
      </Card>

      {latestWave && (
        <Card>
          <CardHeader>
            <CardTitle>Current Wave Participants</CardTitle>
          </CardHeader>
          <CardContent>
            <RsvpParticipantsTable wave={latestWave} />
          </CardContent>
        </Card>
      )}

      {summary.previousWaves.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Wave History</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wave</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Respond by</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead>Accepted</TableHead>
                  <TableHead>Declined</TableHead>
                  <TableHead>Timed out</TableHead>
                  <TableHead className='w-24'> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.previousWaves.map((wave) => (
                  <TableRow key={wave.id}>
                    <TableCell>{wave.wave}</TableCell>
                    <TableCell>
                      <LocalDateTime
                        value={wave.createdAt}
                        dateStyle='medium'
                        timeStyle='short'
                      />
                    </TableCell>
                    <TableCell>
                      <LocalDateTime
                        value={wave.respondBy}
                        dateStyle='medium'
                        timeStyle='short'
                      />
                    </TableCell>
                    <TableCell>{wave.invitedCount}</TableCell>
                    <TableCell>{wave.acceptedCount}</TableCell>
                    <TableCell>{wave.declinedCount}</TableCell>
                    <TableCell>{wave.timedOutCount}</TableCell>
                    <TableCell>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() =>
                          setHistoryWaveId((current) =>
                            current === wave.id ? null : wave.id,
                          )
                        }
                      >
                        {historyWaveId === wave.id ? 'Hide' : 'View'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {openHistoryWave && (
              <div className='flex flex-col gap-2'>
                <p className='text-sm font-medium'>
                  Wave {openHistoryWave.wave} participants
                </p>
                <RsvpParticipantsTable wave={openHistoryWave} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
