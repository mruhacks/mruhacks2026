'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import {
  moveWaitlistParticipant,
  type AdminRsvpSummary,
  type AdminRsvpWaveSummary,
  type WaitlistEntry,
} from '@/app/dashboard/admin/events/actions';
import { RsvpParticipantsTable } from '@/app/dashboard/admin/events/RsvpParticipantsTable';
import { SendNextWaveButton } from '@/app/dashboard/admin/events/SendNextWaveButton';
import { LocalDateTime } from '@/components/local-date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRemaining, toDate } from '@/lib/rsvp/format-remaining';
import { estimateAutoWaveAt } from '@/lib/rsvp/scheduled-wave-time';
import { useIsHydrated } from '@/lib/use-is-hydrated';
import { cn } from '@/lib/utils';

type Props = {
  eventId: string;
  summary: AdminRsvpSummary;
  /** The waitlist in queue order; null while loading. */
  waitlist: WaitlistEntry[] | null;
  waitlistError: string | null;
  rsvpResponseWindowHours: number;
  /**
   * Viewer holds `rsvp:write:all`: may reorder the waitlist and close an open
   * wave early to send the next one.
   */
  canManageRsvp: boolean;
  onReordered: (entries: WaitlistEntry[]) => void;
  onWaveSent: () => void;
};

/**
 * Every wave in one list, oldest first: the waves already sent, then the
 * next wave and later waves projected from the waitlist. The waitlist is the
 * queue waves invite from, so its order decides which projected wave each
 * person lands in. Each wave is collapsed to a summary line until expanded.
 */
export function RsvpWavesCard({
  eventId,
  summary,
  waitlist,
  waitlistError,
  rsvpResponseWindowHours,
  canManageRsvp,
  onReordered,
  onWaveSent,
}: Props) {
  const canReorder = canManageRsvp;
  const sentWaves = [...summary.previousWaves, summary.latestWave]
    .filter((wave): wave is AdminRsvpWaveSummary => wave !== null)
    .sort((a, b) => a.wave - b.wave);
  const openWave = summary.latestWave?.isActive ? summary.latestWave : null;
  const nextWaveNumber = (summary.latestWave?.wave ?? 0) + 1;

  const queue = waitlist ?? [];
  // The next wave fills every open spot (capacity − accepted) from the top.
  const cutoff = summary.eventHasStarted
    ? 0
    : summary.availableSpots === null
      ? queue.length
      : Math.min(summary.availableSpots, queue.length);
  const nextWave = queue.slice(0, cutoff);
  const later = queue.slice(cutoff);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waves</CardTitle>
        <CardDescription>
          Accepted applications wait on the waitlist, and each wave invites from
          the top of it to fill the open spots. Expand a wave to see who is in
          it.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        {sentWaves.map((wave) => (
          <WaveSection
            key={wave.id}
            title={`Wave ${wave.wave}`}
            badge={
              wave.isActive ? (
                <Badge variant='purple'>Open</Badge>
              ) : (
                <Badge variant='outline'>Closed</Badge>
              )
            }
            summary={<SentWaveSummary wave={wave} />}
          >
            <RsvpParticipantsTable eventId={eventId} wave={wave} />
          </WaveSection>
        ))}

        {waitlistError ? (
          <p className='text-muted-foreground text-sm'>{waitlistError}</p>
        ) : waitlist === null ? (
          <p className='text-muted-foreground text-sm'>Loading waitlist…</p>
        ) : (
          <>
            <WaveSection
              title={`Wave ${nextWaveNumber}`}
              badge={<Badge variant='outline'>Next</Badge>}
              summary={
                <NextWaveSummary
                  summary={summary}
                  queueLength={queue.length}
                  inviteCount={cutoff}
                  openWaveNumber={openWave?.wave ?? null}
                />
              }
              disabled={nextWave.length === 0}
              action={
                nextWave.length > 0 && (
                  <SendNextWaveButton
                    eventId={eventId}
                    nextWaveNumber={nextWaveNumber}
                    isFirstWave={summary.latestWave === null}
                    inviteCount={nextWave.length}
                    rsvpResponseWindowHours={rsvpResponseWindowHours}
                    openWave={
                      openWave
                        ? {
                            wave: openWave.wave,
                            waitingCount: openWave.waitingCount,
                          }
                        : null
                    }
                    canCloseOpenWave={canManageRsvp}
                    onWaveSent={onWaveSent}
                  />
                )
              }
            >
              <WaitlistTable
                eventId={eventId}
                entries={nextWave}
                queueLength={queue.length}
                canReorder={canReorder}
                onReordered={onReordered}
              />
            </WaveSection>

            {later.length > 0 && (
              <WaveSection
                title='Later waves'
                badge={<Badge variant='secondary'>Waitlist</Badge>}
                summary={`${later.length} ${later.length === 1 ? 'person' : 'people'}, invited in order as spots open up.`}
              >
                <WaitlistTable
                  eventId={eventId}
                  entries={later}
                  queueLength={queue.length}
                  canReorder={canReorder}
                  onReordered={onReordered}
                />
              </WaveSection>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SentWaveSummary({ wave }: { wave: AdminRsvpWaveSummary }) {
  const responded = wave.acceptedCount + wave.declinedCount;
  const rate =
    wave.invitedCount === 0
      ? null
      : Math.round((responded / wave.invitedCount) * 100);

  return (
    <span className='flex flex-col gap-1'>
      <span className='flex flex-wrap gap-x-3 gap-y-1'>
        <span>
          Started{' '}
          <LocalDateTime
            value={wave.createdAt}
            dateStyle='medium'
            timeStyle='short'
          />
        </span>
        <span>
          {wave.isActive ? 'Ends' : 'Ended'}{' '}
          <LocalDateTime
            value={wave.respondBy}
            dateStyle='medium'
            timeStyle='short'
          />
          {wave.isActive && <TimeUntil at={wave.respondBy} />}
        </span>
      </span>
      <span className='flex flex-wrap gap-x-3 gap-y-1'>
        <span className='text-foreground font-medium'>
          {rate === null
            ? 'No invitations'
            : `${rate}% responded (${responded} of ${wave.invitedCount})`}
        </span>
        <span>
          {wave.acceptedCount} accepted · {wave.declinedCount} declined ·{' '}
          {wave.isActive
            ? `${wave.waitingCount} waiting`
            : `${wave.timedOutCount} timed out`}
          {wave.isActive && wave.timedOutCount > 0
            ? ` · ${wave.timedOutCount} timed out`
            : ''}
        </span>
      </span>
    </span>
  );
}

/**
 * What the next wave will do and roughly when the scheduler sends it on its
 * own. "Now" only exists after hydration, so the estimate appears then.
 */
function NextWaveSummary({
  summary,
  queueLength,
  inviteCount,
  openWaveNumber,
}: {
  summary: AdminRsvpSummary;
  queueLength: number;
  inviteCount: number;
  openWaveNumber: number | null;
}) {
  const isHydrated = useIsHydrated();

  if (summary.eventHasStarted) {
    return 'The event has started, so no more waves will go out.';
  }
  if (queueLength === 0) {
    return 'Nobody is on the waitlist.';
  }

  const who =
    inviteCount === 0
      ? 'No open spots right now. Goes out once someone gives up their spot, declines or times out.'
      : `${inviteCount} ${inviteCount === 1 ? 'person' : 'people'} from the top of the waitlist${
          openWaveNumber !== null
            ? `, fewer if anyone in wave ${openWaveNumber} accepts before it ends`
            : ''
        }.`;

  let when: React.ReactNode;
  if (!summary.latestWave || !isHydrated) {
    // The first wave is always sent by hand ("Start waves").
    when = null;
  } else {
    const at = estimateAutoWaveAt(
      toDate(summary.latestWave.respondBy),
      new Date(),
    );
    when =
      at === null ? null : (
        <>
          {inviteCount === 0
            ? 'Checked hourly; next check'
            : 'Sends automatically'}{' '}
          ~
          <LocalDateTime value={at} dateStyle='medium' timeStyle='short' />
          <TimeUntil at={at} />
        </>
      );
  }

  return (
    <span className='flex flex-col gap-1'>
      <span>{who}</span>
      {when && <span>{when}</span>}
    </span>
  );
}

/** " (in 3h 20m)" after hydration; nothing once `at` has passed. */
function TimeUntil({ at }: { at: Date | string }) {
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;
  const remaining = formatRemaining(toDate(at), new Date());
  return remaining ? <> (in {remaining})</> : null;
}

function WaveSection({
  title,
  badge,
  summary,
  disabled = false,
  action,
  children,
}: {
  title: string;
  badge: React.ReactNode;
  summary: React.ReactNode;
  /** Nothing to expand. */
  disabled?: boolean;
  /** Shown beside the summary, outside the expand toggle. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const contentId = React.useId();

  return (
    <div className='rounded-md border'>
      <div className='flex items-start'>
        <button
          type='button'
          className='hover:bg-muted/50 flex min-w-0 flex-1 items-start gap-3 p-3 text-left disabled:cursor-default disabled:hover:bg-transparent'
          aria-expanded={open}
          aria-controls={contentId}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronRight
            className={cn(
              'text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform',
              open && 'rotate-90',
              disabled && 'opacity-0',
            )}
            aria-hidden
          />
          <span className='flex min-w-0 flex-col gap-1'>
            <span className='flex items-center gap-2 font-medium'>
              {title}
              {badge}
            </span>
            <span className='text-muted-foreground text-sm'>{summary}</span>
          </span>
        </button>
        {action && <div className='shrink-0 p-3'>{action}</div>}
      </div>
      {open && !disabled && (
        <div id={contentId} className='border-t p-3'>
          {children}
        </div>
      )}
    </div>
  );
}

function WaitlistTable({
  eventId,
  entries,
  queueLength,
  canReorder,
  onReordered,
}: {
  eventId: string;
  entries: WaitlistEntry[];
  /** Length of the whole waitlist, not just this wave's slice. */
  queueLength: number;
  canReorder: boolean;
  onReordered: (entries: WaitlistEntry[]) => void;
}) {
  const [movingId, setMovingId] = React.useState<string | null>(null);

  async function move(participantId: string, position: number) {
    setMovingId(participantId);
    try {
      const result = await moveWaitlistParticipant({
        eventId,
        participantId,
        position,
      });
      if (!result.success) return result.error;
      onReordered(result.data ?? []);
      return null;
    } catch {
      return 'Failed to move participant.';
    } finally {
      setMovingId(null);
    }
  }

  async function nudge(participantId: string, position: number) {
    const moveError = await move(participantId, position);
    if (moveError) toast.error(moveError);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='w-16'>Place</TableHead>
          <TableHead>Applicant</TableHead>
          <TableHead>Applied</TableHead>
          {canReorder && <TableHead className='w-40'> </TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.participantId}>
            <TableCell className='font-medium tabular-nums'>
              {entry.position}
            </TableCell>
            <TableCell>
              <div className='flex flex-col'>
                <span className='font-medium'>{entry.name}</span>
                <span className='text-muted-foreground text-xs'>
                  {entry.email}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <LocalDateTime value={entry.appliedAt} dateStyle='medium' />
            </TableCell>
            {canReorder && (
              <TableCell>
                <div className='flex justify-end gap-1'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={`Move ${entry.name} up`}
                    disabled={movingId !== null || entry.position === 1}
                    onClick={() =>
                      nudge(entry.participantId, entry.position - 1)
                    }
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={`Move ${entry.name} down`}
                    disabled={
                      movingId !== null || entry.position === queueLength
                    }
                    onClick={() =>
                      nudge(entry.participantId, entry.position + 1)
                    }
                  >
                    <ArrowDown />
                  </Button>
                  <MoveToPositionButton
                    entry={entry}
                    max={queueLength}
                    disabled={movingId !== null}
                    onMove={(position) => move(entry.participantId, position)}
                  />
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MoveToPositionButton({
  entry,
  max,
  disabled,
  onMove,
}: {
  entry: WaitlistEntry;
  max: number;
  disabled: boolean;
  /** Resolves to an error message, or null on success. */
  onMove: (position: number) => Promise<string | null>;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(String(entry.position));
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const position = Number(value);
    if (!Number.isInteger(position) || position < 1 || position > max) {
      setError(`Enter a place from 1 to ${max}.`);
      return;
    }
    setSubmitting(true);
    const moveError = await onMove(position);
    setSubmitting(false);
    if (moveError) {
      setError(moveError);
      return;
    }
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValue(String(entry.position));
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type='button' variant='outline' size='sm' disabled={disabled}>
          Move to…
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-56'>
        <form onSubmit={handleSubmit} className='flex flex-col gap-2'>
          <label
            htmlFor={`waitlist-place-${entry.participantId}`}
            className='text-sm font-medium'
          >
            Place in waitlist (1–{max})
          </label>
          <Input
            id={`waitlist-place-${entry.participantId}`}
            type='number'
            inputMode='numeric'
            min={1}
            max={max}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            aria-invalid={error !== null}
          />
          {error && <FieldError errors={[{ message: error }]} />}
          <Button type='submit' size='sm' disabled={submitting}>
            {submitting ? 'Moving…' : 'Move'}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
