import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { eq, and } from 'drizzle-orm';

import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { BreadcrumbSegment } from '@/components/breadcrumb-context';
import {
  events,
  eventTypes,
  eventAttendees,
} from '@/db/schema';
import { getUserApplicationStatus } from '@/app/dashboard/events/actions';
import { ApplicationStatusBanner } from '@/app/dashboard/events/ApplicationStatusBanner';
import { RegisterEventButton } from '@/app/dashboard/events/RegisterEventButton';
import { UnregisterEventButton } from '@/app/dashboard/events/UnregisterEventButton';
import { TeamPanel } from '@/app/dashboard/events/team/TeamPanel';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CalendarDays, Users } from 'lucide-react';

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function formatDate(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d);
}

function formatDateShort(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
}

function dateRange(startsAt: Date | null, endsAt: Date | null) {
  if (!startsAt) return 'Date TBA';
  const start = formatDateShort(startsAt);
  const end = endsAt ? formatDateShort(endsAt) : null;
  return end && end !== start ? `${start} – ${end}` : (formatDate(startsAt) ?? start);
}

export default async function EventEntryPage({ params, searchParams }: Props) {
  const { eventId } = await params;
  const { joinCode: rawJoinCode } = await searchParams;
  // A repeated `?joinCode=` (a double-appended share link) arrives as an
  // array; take the first so the dialog always gets a plain code string.
  const joinCode = Array.isArray(rawJoinCode) ? rawJoinCode[0] : rawJoinCode;
  const user = await getUser();
  if (!user) redirect('/signin');

  const [row] = await db
    .select({
      id: events.id,
      name: events.name,
      hasApplication: events.hasApplication,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      capacity: events.capacity,
      teamsEnabled: events.teamsEnabled,
      eventTypeLabel: eventTypes.label,
    })
    .from(events)
    .leftJoin(eventTypes, eq(events.eventTypeId, eventTypes.id))
    .where(eq(events.id, eventId))
    .limit(1);

  if (!row) notFound();

  if (row.hasApplication) {
    const applicationStatus = await getUserApplicationStatus(eventId);
    const isFinal = applicationStatus?.statusDisplay.isFinal ?? false;

    return (
      <div className='max-w-2xl space-y-6'>
        <BreadcrumbSegment id={eventId} label={row.name} />
        <div>
          <Button asChild variant='ghost' size='sm' className='text-muted-foreground -ml-2 mb-2'>
            <Link href='/dashboard'>
              <ArrowLeft className='mr-1.5 size-4' />
              My events
            </Link>
          </Button>
          <EventTypeTag label={row.eventTypeLabel} hasApplication />
          <h1 className='mt-2 text-3xl font-semibold'>{row.name}</h1>
          <EventMeta startsAt={row.startsAt} endsAt={row.endsAt} capacity={row.capacity} />
        </div>

        {applicationStatus && (
          <ApplicationStatusBanner
            application={applicationStatus}
            editHref={`/dashboard/events/${eventId}/apply`}
          />
        )}

        {row.teamsEnabled &&
          applicationStatus &&
          applicationStatus.statusKey !== 'denied' && (
            <TeamPanel eventId={eventId} joinCode={joinCode} />
          )}

        {isFinal ? (
          <div className='flex gap-3'>
            <Button asChild variant='outline'>
              <Link href='/dashboard'>← Back to dashboard</Link>
            </Button>
          </div>
        ) : applicationStatus ? (
          <div className='flex gap-3'>
            <Button asChild variant='outline'>
              <Link href='/dashboard'>Back to dashboard</Link>
            </Button>
          </div>
        ) : (
          <div className='space-y-4'>
            <p className='text-muted-foreground'>
              This event uses an application process. Tell us a little about
              yourself — spots are limited and reviewed by our team.
            </p>
            <div className='flex gap-3'>
              <Button asChild size='lg'>
                <Link href={`/dashboard/events/${eventId}/apply`}>
                  Start Application
                </Link>
              </Button>
              <Button asChild variant='outline' size='lg'>
                <Link href='/dashboard'>Not now</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Open-registration event
  const [attendeeRow] = await db
    .select({ userId: eventAttendees.userId })
    .from(eventAttendees)
    .where(
      and(
        eq(eventAttendees.eventId, eventId),
        eq(eventAttendees.userId, user.id),
      ),
    )
    .limit(1);

  const isRegistered = Boolean(attendeeRow);

  return (
    <div className='max-w-2xl space-y-6'>
      <BreadcrumbSegment id={eventId} label={row.name} />
      <div>
        <Button asChild variant='ghost' size='sm' className='text-muted-foreground -ml-2 mb-2'>
          <Link href='/dashboard'>
            <ArrowLeft className='mr-1.5 size-4' />
            My events
          </Link>
        </Button>
        <EventTypeTag label={row.eventTypeLabel} hasApplication={false} />
        <h1 className='mt-2 text-3xl font-semibold'>{row.name}</h1>
        <EventMeta startsAt={row.startsAt} endsAt={row.endsAt} capacity={row.capacity} />
      </div>

      {isRegistered ? (
        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <div className='flex items-center justify-between gap-2'>
                <CardTitle className='text-base'>You&apos;re registered</CardTitle>
                <Badge variant='success'>Registered</Badge>
              </div>
              <CardDescription>
                Your spot is confirmed. We&apos;ll see you there!
              </CardDescription>
            </CardHeader>
            <CardContent className='flex gap-3'>
              <Button asChild variant='outline' size='sm'>
                <Link href='/dashboard'>Back to dashboard</Link>
              </Button>
              <UnregisterEventButton eventId={eventId} />
            </CardContent>
          </Card>
          {row.teamsEnabled && (
            <TeamPanel eventId={eventId} joinCode={joinCode} />
          )}
        </div>
      ) : (
        <div className='space-y-4'>
          <p className='text-muted-foreground'>
            No application required — register now to save your spot.
          </p>
          <div className='flex gap-3'>
            <RegisterEventButton eventId={eventId} />
            <Button asChild variant='outline' size='lg'>
              <Link href='/dashboard'>Not now</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventTypeTag({
  label,
  hasApplication,
}: {
  label: string | null;
  hasApplication: boolean;
}) {
  const display = label
    ? label.charAt(0).toUpperCase() + label.slice(1)
    : hasApplication
      ? 'Application required'
      : 'Open registration';
  return (
    <Badge variant='outline' className='text-muted-foreground text-xs'>
      {display}
    </Badge>
  );
}

function EventMeta({
  startsAt,
  endsAt,
  capacity,
}: {
  startsAt: Date | null;
  endsAt: Date | null;
  capacity: number | null;
}) {
  return (
    <div className='text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm'>
      {(startsAt || endsAt) && (
        <span className='flex items-center gap-1.5'>
          <CalendarDays className='size-4 shrink-0' />
          {dateRange(startsAt, endsAt)}
        </span>
      )}
      {capacity != null && (
        <span className='flex items-center gap-1.5'>
          <Users className='size-4 shrink-0' />
          {capacity} spots
        </span>
      )}
    </div>
  );
}
