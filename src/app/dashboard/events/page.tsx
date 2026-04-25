import { redirect } from 'next/navigation';
import Link from 'next/link';

import { getUser } from '@/utils/auth';
import { getEventsWithUserStatus } from '@/app/dashboard/events/actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RegisterEventButton } from './RegisterEventButton';
import { UnregisterEventButton } from './UnregisterEventButton';
import { Calendar } from 'lucide-react';
import { RegisterEventInterestButton } from './RegisterEventInterestButton';
import { getUserProfile } from '../profile/actions';

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
              <Card className='flex h-full flex-col'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-lg'>{event.name}</CardTitle>
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
                <CardContent className='mt-2 flex flex-wrap items-center gap-2'>
                  {event.hasApplication ? (
                    <Button asChild size='sm' variant='default'>
                      <Link href={`/dashboard/events/${event.id}/apply`}>
                        {event.userStatus === 'applied'
                          ? 'Edit application'
                          : 'Apply'}
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
                      userHasRegisteredInterest={event.userHasRegisteredInterest}
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
