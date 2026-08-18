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
import { UnregisterEventButton } from './UnregisterEventButton';
import { RegisterEventInterestButton } from './RegisterEventInterestButton';
import { Calendar } from 'lucide-react';

function formatDate(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
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
              <Card className='hover:border-primary/40 relative flex h-full flex-col transition-colors'>
                <Link
                  href={`/dashboard/events/${event.id}`}
                  className='absolute inset-0 z-0 rounded-xl'
                  aria-label={`View ${event.name}`}
                />
                <CardHeader className='pb-2'>
                  <div className='flex items-start justify-between gap-2'>
                    <CardTitle className='text-lg'>{event.name}</CardTitle>
                    {event.hasApplication &&
                      event.userStatus === 'applied' &&
                      event.statusDisplay && (
                        <Badge variant={event.statusDisplay.variant}>
                          {event.statusDisplay.title}
                        </Badge>
                      )}
                    {!event.hasApplication &&
                      event.userStatus === 'registered' && (
                        <Badge variant='success'>Registered</Badge>
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
                <CardContent className='relative z-10 mt-auto flex flex-wrap items-center gap-2 pt-4'>
                  {!event.hasApplication && event.userStatus === 'registered' && (
                    <UnregisterEventButton eventId={event.id} />
                  )}

                  {hasProfile ? (
                    <RegisterEventInterestButton
                      eventId={event.id}
                      userHasRegisteredInterest={
                        event.userHasRegisteredInterest
                      }
                    />
                  ) : (
                    <Button asChild size='sm' variant='outline'>
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
