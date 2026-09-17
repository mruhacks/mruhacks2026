import Link from 'next/link';
import { QrCode } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Links to /dashboard/events/[eventId]/ticket — intercepted as a modal when
 * navigated to from the event page, or a real full page on direct visit or
 * refresh (see the `@modal` parallel route next to this page).
 */
export function EventTicketButton({
  eventId,
  className,
}: {
  eventId: string;
  className?: string;
}) {
  return (
    <Button asChild variant='outline' className={className}>
      <Link href={`/dashboard/events/${eventId}/ticket`}>
        <QrCode className='size-4' />
        Event Ticket
      </Link>
    </Button>
  );
}
