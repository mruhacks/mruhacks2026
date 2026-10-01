import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUser } from '@/utils/auth';
import { hasPermission, requirePermission } from '@/lib/rbac/authorization';
import { getAllEvents, getEventParticipationCounts } from '@/lib/events';
import { adminEventPath } from '@/lib/event-slug';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { CreateEventDialog } from '@/components/events/create-event-dialog';

function EventListSkeleton() {
  return (
    <div className='grid gap-4'>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className='bg-muted animate-pulse rounded-xl'
          style={{ height: 150 }}
        />
      ))}
    </div>
  );
}

/**
 * Tools each card links to, by their page under the event's admin dashboard.
 * Each is gated on the permission that page gates itself on — never a shared
 * "is this an admin" bundle. See AGENTS.md.
 *
 * Applications aren't listed: the card itself already links to the event
 * dashboard, where the applications table lives.
 */
const EVENT_TOOLS = [
  { label: 'Check-in', path: 'checkin', permission: 'checkin:write:all' },
  { label: 'Sub-events', path: 'subevents', permission: 'event:manage:all' },
  { label: 'Wiki', path: 'wiki', permission: 'article:read:all' },
] as const;

// Permission check reads the session; the event list is cached but keyed
// off it being authorized to view, so both stream in behind one boundary.
async function EventList() {
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'event:manage');

  // TODO: Add event:manage:all permission check to ensure user can access all events,
  // or implement event-level scoping (e.g., event:manage:{eventId}) for organizers
  // who manage specific events only.

  const [allEvents, counts, ...toolAccess] = await Promise.all([
    getAllEvents(),
    getEventParticipationCounts(),
    ...EVENT_TOOLS.map((tool) => hasPermission(user.id, tool.permission)),
  ]);

  const visibleTools = EVENT_TOOLS.filter((_, i) => toolAccess[i]);

  return (
    <div className='grid gap-4'>
      {allEvents.map((event) => {
        const eventCounts = counts[event.id] ?? {
          applications: 0,
          attendees: 0,
        };
        // Applications for an event with a form, signups for one without.
        const value = event.hasApplication
          ? eventCounts.applications
          : eventCounts.attendees;
        const unit = event.hasApplication ? 'Application' : 'Registration';

        return (
          <Card key={event.id} className='hover:border-primary/40 relative'>
            {/* Stretched over the card rather than wrapping it, so the tool
                buttons below sit above it and stay clickable. */}
            {/* prefetch: the dashboard depends on this event's `params`, so
                the App Shell for it is only resolved ahead of the click with
                per-link prefetching. See AGENTS.md / Cache Components. */}
            <Link
              href={adminEventPath(event)}
              prefetch
              className='absolute inset-0 rounded-xl'
              aria-label={`Manage ${event.name}`}
            />
            <CardContent className='flex flex-col gap-4'>
              <div className='flex items-center justify-between gap-4'>
                <div className='min-w-0'>
                  <p
                    className='truncate'
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontWeight: 'var(--fw-semibold)',
                      fontSize: '17px',
                      margin: 0,
                    }}
                  >
                    {event.name}
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 'var(--fw-semibold)',
                      fontSize: '30px',
                      lineHeight: 'var(--lh-tight)',
                      letterSpacing: 'var(--track-display)',
                      margin: '10px 0 0',
                    }}
                  >
                    {value.toLocaleString()}
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-ds-mono)',
                      fontSize: '12px',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-500)',
                      margin: '6px 0 0',
                    }}
                  >
                    {value === 1 ? unit : `${unit}s`}
                  </p>
                </div>
                <ExternalLink
                  aria-hidden
                  className='text-muted-foreground size-5 shrink-0'
                />
              </div>

              {visibleTools.length > 0 && (
                // Above the stretched link so these stay clickable.
                <div className='relative flex flex-wrap gap-2'>
                  {visibleTools.map((tool) => (
                    <Button
                      key={tool.label}
                      asChild
                      variant='outline'
                      size='sm'
                    >
                      <Link href={`${adminEventPath(event)}/${tool.path}`}>
                        {tool.label}
                      </Link>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {allEvents.length === 0 && (
        <Card>
          <CardContent className='py-8 text-center'>
            <p className='text-muted-foreground text-sm'>No events found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AdminEventsMealsPage() {
  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold'>Events &amp; Meals</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            Manage events, applications, and questions.
          </p>
        </div>
        <CreateEventDialog />
      </div>

      <Suspense fallback={<EventListSkeleton />}>
        <EventList />
      </Suspense>
    </div>
  );
}
