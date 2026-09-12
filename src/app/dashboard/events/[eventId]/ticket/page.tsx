import Link from 'next/link';

import { EventTicketCard } from '@/components/event-ticket-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getTicketViewData } from '@/lib/wallet/get-ticket-view-data';
import { ArrowLeft } from 'lucide-react';

export default async function TicketPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const ticket = await getTicketViewData(eventId);

  return (
    <div className='mx-auto flex max-w-sm flex-col gap-4 py-8'>
      <Button
        asChild
        variant='ghost'
        size='sm'
        className='text-muted-foreground -ml-2 w-fit'
      >
        <Link href={`/dashboard/events/${eventId}`}>
          <ArrowLeft data-icon='inline-start' />
          Back to event
        </Link>
      </Button>
      <Card>
        <CardContent className='py-6'>
          <EventTicketCard {...ticket} />
        </CardContent>
      </Card>
    </div>
  );
}
