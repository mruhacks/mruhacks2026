import * as React from 'react';
import Link from 'next/link';
import { CircleCheckBig, MapPin, Pencil, ScanLine } from 'lucide-react';

import { LocalDateRange } from '@/components/local-date-time';
import { Button } from '@/components/ui/button';
import { isScheduleVisible, type SubeventRow } from '@/lib/subevents';
import { cn } from '@/lib/utils';

import { BentoCard } from '../_components/bento-card';
import { CreateSubeventDialog } from './create-subevent-dialog';
import { DeleteSubeventButton } from './delete-subevent-button';

type Props = {
  eventId: string;
  /** The event's `[eventId]` segment as the URL spells it (uuid or slug). */
  segment: string;
  eventStartsAt: string | null;
  subevents: SubeventRow[];
  checkInCounts: Record<string, number>;
};

export function SubeventList({
  eventId,
  segment,
  eventStartsAt,
  subevents,
  checkInCounts,
}: Props) {
  const base = `/dashboard/admin/events/${segment}`;

  return (
    <BentoCard
      title='Sub-events'
      description='Meals, workshops and ceremonies inside this event. Each one can be checked into on its own.'
      contentClassName='p-0'
      action={
        <CreateSubeventDialog
          eventId={eventId}
          defaultStartsAt={eventStartsAt}
        />
      }
    >
      {subevents.length === 0 ? (
        <p className='text-muted-foreground px-6 py-5 text-sm'>
          No sub-events yet. Add meals and workshops so volunteers can scan for
          them.
        </p>
      ) : (
        <ul className='divide-y'>
          {subevents.map((subevent) => (
            <SubeventRowItem
              key={subevent.id}
              base={base}
              eventId={eventId}
              subevent={subevent}
              checkInCount={checkInCounts[subevent.id] ?? 0}
            />
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

function SubeventRowItem({
  base,
  eventId,
  subevent,
  checkInCount,
}: {
  base: string;
  eventId: string;
  subevent: SubeventRow;
  checkInCount: number;
}) {
  const visible = isScheduleVisible(subevent);

  return (
    <li className='flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <p className='truncate font-medium'>{subevent.name}</p>
        <p className='text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
          <LocalDateRange
            start={subevent.startsAt}
            end={subevent.endsAt}
            singleTimeStyle='short'
          />
          {subevent.location && (
            <span className='inline-flex items-center gap-1.5'>
              <MapPin aria-hidden className='size-3.5 shrink-0' />
              {subevent.location}
            </span>
          )}
          <span className='inline-flex items-center gap-1.5'>
            <CircleCheckBig aria-hidden className='size-3.5 shrink-0' />
            {checkInCount} checked in
          </span>
        </p>
        {/* The schedule gate is easy to trip by clearing a time in the settings
            form, and an organizer would otherwise have no way to tell that
            participants can't see the row. */}
        {!visible && (
          <p className='text-muted-foreground mt-1 text-xs'>
            Hidden from participants — needs both a start and an end time.
          </p>
        )}
      </div>

      <div className='flex shrink-0 items-center gap-1'>
        <Button asChild variant='outline' size='sm' className='h-9'>
          <Link href={`${base}/checkin?target=${subevent.id}`}>
            <ScanLine aria-hidden className='size-4' />
            Check in
          </Link>
        </Button>
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
            href={`/dashboard/admin/events/${subevent.id}/settings`}
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
