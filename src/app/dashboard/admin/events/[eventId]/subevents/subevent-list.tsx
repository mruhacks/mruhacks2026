import * as React from 'react';
import Link from 'next/link';
import { CircleCheckBig, MapPin, Pencil, ScanLine } from 'lucide-react';

import { ScheduleViewport } from '@/components/schedule-viewport';
import { ScheduleDayGroups } from '@/components/schedule-day-groups';
import { serializeInstant } from '@/lib/datetime';
import { LocalDateRange } from '@/components/local-date-time';
import { Button } from '@/components/ui/button';
import { isScheduleVisible, type SubeventRow } from '@/lib/subevents';
import { cn } from '@/lib/utils';

import { ScheduleCard } from '@/components/schedule-card';
import { CreateSubeventDialog } from './create-subevent-dialog';
import { DeleteSubeventButton } from './delete-subevent-button';

type Props = {
  fitContainer?: boolean;
  eventId: string;
  /** The event's `[eventId]` segment as the URL spells it (uuid or slug). */
  segment: string;
  backHref?: string;
  eventStartsAt: string | null;
  checkInEnabled: boolean;
  canCheckIn: boolean;
  subevents: SubeventRow[];
  checkInCounts: Record<string, number>;
};

export function SubeventList({
  fitContainer = false,
  eventId,
  segment,
  backHref,
  eventStartsAt,
  subevents,
  checkInCounts,
  checkInEnabled,
  canCheckIn,
}: Props) {
  const base = `/dashboard/admin/events/${segment}`;

  return (
    <ScheduleCard
      fitContainer={fitContainer}
      action={
        <CreateSubeventDialog
          eventId={eventId}
          defaultStartsAt={eventStartsAt}
        />
      }
    >
      {subevents.length === 0 ? (
        <p className='text-muted-foreground px-4 py-5 text-sm'>
          No schedule entries yet. Add meals, workshops and ceremonies.
        </p>
      ) : (
        <ScheduleViewport
          fitContainer={fitContainer}
          entries={subevents.map((entry) => ({
            id: entry.id,
            startsAt: serializeInstant(entry.startsAt),
            endsAt: serializeInstant(entry.endsAt),
          }))}
        >
          <ScheduleDayGroups
            listClassName='divide-y'
            entries={subevents.map((subevent) => ({
              id: subevent.id,
              startsAt: serializeInstant(subevent.startsAt),
              content: (
                <SubeventRowItem
                  key={subevent.id}
                  base={base}
                  backHref={backHref ?? base}
                  eventId={eventId}
                  subevent={subevent}
                  canCheckIn={
                    canCheckIn && checkInEnabled && subevent.checkInEnabled
                  }
                  checkInCount={checkInCounts[subevent.id] ?? 0}
                />
              ),
            }))}
          />
        </ScheduleViewport>
      )}
    </ScheduleCard>
  );
}

function SubeventRowItem({
  base,
  backHref,
  eventId,
  subevent,
  checkInCount,
  canCheckIn,
}: {
  base: string;
  backHref: string;
  eventId: string;
  subevent: SubeventRow;
  checkInCount: number;
  canCheckIn: boolean;
}) {
  const visible = isScheduleVisible(subevent);

  return (
    <li
      data-schedule-entry={subevent.id}
      className='flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
    >
      <div className='min-w-0'>
        <p className='truncate font-medium'>{subevent.name}</p>
        <p className='text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
          <LocalDateRange
            start={subevent.startsAt}
            end={subevent.endsAt}
            timeOnly
          />
          {subevent.location && (
            <span className='inline-flex items-center gap-1.5'>
              <MapPin aria-hidden className='size-3.5 shrink-0' />
              {subevent.location}
            </span>
          )}
          {canCheckIn && (
            <span className='inline-flex items-center gap-1.5'>
              <CircleCheckBig aria-hidden className='size-3.5 shrink-0' />
              {checkInCount} checked in
            </span>
          )}
        </p>
        {/* The schedule gate is easy to trip by clearing a time in the settings
            form, and an organizer would otherwise have no way to tell that
            participants can't see the row. */}
        {!visible && (
          <p className='text-muted-foreground mt-1 text-xs'>
            Hidden from participants — needs a start time.
          </p>
        )}
      </div>

      <div className='flex shrink-0 items-center gap-1'>
        {canCheckIn && (
          <Button asChild variant='outline' size='sm' className='h-9'>
            <Link href={`${base}/checkin?target=${subevent.id}`}>
              <ScanLine aria-hidden className='size-4' />
              Check in
            </Link>
          </Button>
        )}
        {/* A sub-event is an event, so it's edited with the ordinary event
            settings form. Children never have a slug, so the uuid is the
            segment. */}
        <Button
          asChild
          variant='ghost'
          size='icon-sm'
          className={cn('shrink-0')}
        >
          <Link
            href={{
              pathname: `/dashboard/admin/events/${subevent.id}/settings`,
              query: { back: backHref },
            }}
            aria-label={`Edit ${subevent.name}`}
          >
            <Pencil className='size-4' />
          </Link>
        </Button>
        <DeleteSubeventButton
          eventId={eventId}
          subeventId={subevent.id}
          name={subevent.name}
          checkInCount={checkInCount}
        />
      </div>
    </li>
  );
}
