import { redirect } from 'next/navigation';
import Link from 'next/link';

import { getUser } from '@/utils/auth';
import { getUserProfile } from '@/app/dashboard/profile/actions';
import { getEventsWithUserStatus } from '@/app/dashboard/events/actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RegisterEventButton } from './RegisterEventButton';
import { UnregisterEventButton } from './UnregisterEventButton';
import { RegisterEventInterestButton } from './RegisterEventInterestButton';
import { Calendar } from 'lucide-react';
import {
  type ApplicationStatusLabel,
  getApplicationStatusDisplay,
  getApplicationStatusLabel,
} from '@/app/dashboard/events/application-status';

function formatDate(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

function applyCtaLabel(
  hasApplied: boolean,
  statusKey: ApplicationStatusLabel | null,
): string {
  if (!hasApplied) return 'Apply';

  switch (statusKey) {
    case 'approved':
    case 'denied':
    case 'waitlisted':
      return 'View status';
    case 'pending_review':
    default:
      return 'Edit application';
  }
}

export default async function DashboardEventsPage() {
  const user = await getUser();
  if (!user) redirect('/signin');

  const eventsList = await getEventsWithUserStatus();

  const profileResult = await getUserProfile();
  const hasProfile = profileResult.success && profileResult.data != null;

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='flex items-center gap-2 text-2xl font-semibold'>
          <Calendar className='size-6' />
          Events
        </h1>
        <p className='text-muted-foreground mt-1'>
          Browse events and apply or register to attend.
        </p>
      </div>

      {eventsList.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No events yet</CardTitle>
            <CardDescription>
              There are no events available at the moment. Check back later.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {eventsList.map((event) => (
            <li key={event.id}>
              <Card className='flex h-full flex-col'>
                <CardHeader className='pb-2'>
                  <div className='flex items-start justify-between gap-2'>
                    <CardTitle className='text-lg'>{event.name}</CardTitle>
                    {event.hasApplication && event.userStatus === 'applied' && (
                      <Badge
                        variant={
                          getApplicationStatusDisplay(event.statusKey).variant
                        }
                      >
                        {getApplicationStatusLabel(event.statusKey)}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className='text-sm'>
                    {event.startsAt && (
                      <span>
                        {formatDate(event.startsAt)}
                        {event.endsAt && ` – ${formatDate(event.endsAt)}`}
                      </span>
                    )}
                    {!event.startsAt && 'Date TBA'}
                  </CardDescription>
                </CardHeader>
                <CardContent className='mt-auto pt-4'>
                  {event.hasApplication ? (
                    <Button asChild size='sm' variant='default'>
                      <Link href={`/dashboard/events/${event.id}/apply`}>
                        {applyCtaLabel(
                          event.userStatus === 'applied',
                          event.statusKey,
                        )}
                      </Link>
                    </Button>
                  ) : (
                    <>
                      {event.userStatus === 'registered' ? (
                        <div className='flex items-center gap-2'>
                          <span className='text-muted-foreground text-sm'>
                            You are registered
                          </span>
                          <UnregisterEventButton eventId={event.id} />
                        </div>
                      ) : (
                        <RegisterEventButton eventId={event.id} />
                      )}
                    </>
                  )}

                  {hasProfile ? (
                    <RegisterEventInterestButton
                      eventId={event.id}
                      userHasRegisteredInterest={
                        event.userHasRegisteredInterest
                      }
                    />
                  ) : (
                    <Button asChild size='sm' variant='default'>
                      <Link href='/dashboard/profile?next=/dashboard/events'>
                        Complete profile to notify me
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
