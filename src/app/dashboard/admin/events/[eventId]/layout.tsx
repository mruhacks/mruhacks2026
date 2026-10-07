import * as React from 'react';
import { notFound, redirect } from 'next/navigation';
import { CalendarDays, MapPin } from 'lucide-react';

import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import { LocalDateRange } from '@/components/local-date-time';
import { getAdminEventHeader } from '@/lib/admin-event';
import { resolveEventId } from '@/lib/events';
import { hasPermission, requireAnyPermission } from '@/lib/rbac/authorization';
import { EVENT_DASHBOARD_PERMISSIONS } from '@/lib/rbac/event-access';
import { getUser } from '@/utils/auth';

import { EditEventButton } from './_components/edit-event-button';
import { EventBackLink } from './_components/event-back-link';
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
  // The segment is the event's uuid or its custom slug; the header and every
  // page below it read by the resolved uuid, while links keep the segment.
  const { eventId: segment } = await paramsPromise;
  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();

  const user = await getUser();
  if (!user) redirect('/signin');
  // Any one tool under this event is enough to get in; each page and cell
  // below gates itself on its own permission.
  await requireAnyPermission(user.id, [...EVENT_DASHBOARD_PERMISSIONS]);

  const [event, canEditEvent] = await Promise.all([
    getAdminEventHeader(eventId),
    // Same permission the settings page gates on.
    hasPermission(user.id, 'event:manage:all'),
  ]);

  if (!event) notFound();

  return (
    <header className='flex flex-col gap-4'>
      <nav aria-label='Event navigation'>
        <EventBackLink />
      </nav>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        {/* Zero-render: feeds the event's name to the dashboard breadcrumb,
          which otherwise shows the raw uuid. */}
        <BreadcrumbSegment id={segment} label={event.name} />

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

        <div className='flex shrink-0 flex-wrap items-center gap-2'>
          <ShareEventButton eventId={event.id} slug={event.slug} />

          {canEditEvent && <EditEventButton />}
        </div>
      </div>
    </header>
  );
}
