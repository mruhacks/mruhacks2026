import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUser } from '@/utils/auth';
import { requirePermission } from '@/app/actions/authz';
import { db } from '@/utils/db';
import { events } from '@/db/schema';
import { desc } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileQuestion, Plus } from 'lucide-react';
import { CreateEventDialog } from '@/components/events/create-event-dialog';

export default async function AdminEventsMealsPage() {
  const user = await getUser();
  if (!user) redirect('/signin');
  await requirePermission(user.id, 'event:manage');

  // TODO: Add event:manage:all permission check to ensure user can access all events,
  // or implement event-level scoping (e.g., event:manage:{eventId}) for organizers
  // who manage specific events only.

  const allEvents = await db
    .select({ id: events.id, name: events.name, hasApplication: events.hasApplication })
    .from(events)
    .orderBy(desc(events.createdAt));

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

      <div className='grid gap-4'>
        {allEvents.map((event) => (
          <Card key={event.id} className='hover:bg-muted/50 transition-colors cursor-pointer'>
            <CardHeader className='pb-3'>
              <Link href={`/dashboard/admin/events/${event.id}`} className='block'>
                <div className='flex items-center justify-between'>
                  <div>
                    <CardTitle className='text-base'>{event.name}</CardTitle>
                    <CardDescription>
                      {event.hasApplication ? 'Has application form' : 'No application required'}
                    </CardDescription>
                  </div>
                  <FileQuestion className='size-5 text-muted-foreground' />
                </div>
              </Link>
            </CardHeader>
          </Card>
        ))}

        {allEvents.length === 0 && (
          <Card>
            <CardContent className='py-8 text-center'>
              <p className='text-muted-foreground text-sm'>No events found.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
