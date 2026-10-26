import { EventTicketCard } from '@/components/event-ticket-card';
import { RouteModal } from '@/components/route-modal';
import * as Wallet from '@/lib/wallet/server';

export default async function TicketModal({ params }: { params: Promise<{ eventId: string }> }) {
  // Raw segment — `getTicketViewData` resolves a custom slug to the uuid.
  const { eventId: segment } = await params;
  const ticket = await Wallet.getTicketViewData(segment);

  return (
    <RouteModal title={`Event ticket for ${ticket.eventName}`} className='sm:max-w-sm'>
      <EventTicketCard {...ticket} />
    </RouteModal>
  );
}
