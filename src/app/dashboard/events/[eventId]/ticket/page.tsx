import { EventTicketCard } from '@/components/event-ticket-card';
import { Card, CardContent } from '@/components/ui/card';
import * as Ticket from '@/lib/ticket/server';

export default async function TicketPage({ params }: { params: Promise<{ eventId: string }> }) {
  // Kept as the raw segment: `getViewData` resolves a custom slug to
  // the uuid itself.
  const { eventId: segment } = await params;
  const ticket = await Ticket.getViewData(segment);

  return (
    <div className='mx-auto flex max-w-sm flex-col gap-4 py-8'>
      <Card>
        <CardContent className='py-6'>
          <EventTicketCard {...ticket} />
        </CardContent>
      </Card>
    </div>
  );
}
