import * as React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CalendarDays, MapPin, SquarePen } from 'lucide-react';

import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { LocalDateRange } from '@/components/local-date-time';
import { Button } from '@/components/ui/button';
import { getAdminEventHeader } from '@/lib/admin-event';
import { hasPermission, requirePermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';

import { EventLiveBadge } from './_components/event-live-badge';
import { ShareEventButton } from './_components/share-event-button';

type EventLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
};

/**
 * Chrome shared by the event dashboard and every tool page under it.
 *
 * Deliberately a *sync* component with no top-level `await`: that's what lets
 * Cache Components prerender this segment into the route's App Shell, so an
 * admin passing through on their way to check-in gets the frame painted
 * before a single query resolves. The session read and the event lookup are
 * pushed down into `EventHeader`, behind the Suspense boundary. Adding an
 * `await` here — or bringing back `export const instant = false` — undoes
 * that for this route and everything nested under it.
 */
export default function EventLayout({ children, params }: EventLayoutProps) {
  return (
    <div className='space-y-6'>
      <React.Suspense fallback={<EventHeaderSkeleton />}>
        <EventHeader paramsPromise={params} />
      </React.Suspense>
      {children}
    </div>
  );
}

function EventHeaderSkeleton() {
  return (
    <div className='space-y-3'>
      <div className='bg-muted h-9 w-72 animate-pulse rounded-md' />
      <div className='bg-muted h-4 w-96 animate-pulse rounded-md' />
    </div>
  );
}

async function EventHeader({
  paramsPromise,
}: {
  paramsPromise: Promise<{ eventId: string }>;
}) {
  const { eventId } = await paramsPromise;

  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'event:manage');

  const [event, canEdit] = await Promise.all([
    getAdminEventHeader(eventId),
    hasPermission(user.id, 'event:manage:all'),
  ]);

  if (!event) notFound();

  return (
    <header className='flex flex-wrap items-start justify-between gap-4'>
      {/* Zero-render: feeds the event's name to the dashboard breadcrumb,
          which otherwise shows the raw uuid. */}
      <BreadcrumbSegment id={eventId} label={event.name} />

      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-3'>
          <h1
            className='m-0 truncate'
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--fw-semibold)',
              fontSize: '34px',
              lineHeight: 'var(--lh-tight)',
              letterSpacing: 'var(--track-display)',
            }}
          >
            {event.name}
          </h1>
          <EventLiveBadge startsAt={event.startsAt} endsAt={event.endsAt} />
        </div>

        <div className='text-muted-foreground mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm'>
          <span className='inline-flex items-center gap-1.5'>
            <CalendarDays aria-hidden className='size-4 shrink-0' />
            <LocalDateRange start={event.startsAt} end={event.endsAt} />
          </span>
          {event.location && (
            <span className='inline-flex items-center gap-1.5'>
              <MapPin aria-hidden className='size-4 shrink-0' />
              {event.location}
            </span>
          )}
        </div>
      </div>

      <div className='flex shrink-0 items-center gap-2'>
        <ShareEventButton eventId={eventId} />
        {canEdit && (
          <Button asChild variant='outline' size='sm'>
            <Link href={`/dashboard/admin/events/${eventId}/settings`}>
              <SquarePen aria-hidden className='size-4' />
              Edit event
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
