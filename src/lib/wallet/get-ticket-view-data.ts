import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { getUser } from '@/utils/auth';
import { resolveEventId } from '@/lib/events';
import { getParentEventId } from '@/lib/subevents';
import { formatDateRange } from './format';
import { getEventParticipation } from './participation';

/**
 * Shared by the full-page and intercepted-modal ticket routes so they can
 * never render different content for the same event/user.
 *
 * Takes the raw `[eventId]` route segment — uuid or custom slug — and returns
 * the resolved uuid, which is what the wallet and QR endpoints the ticket
 * card links to are keyed by.
 */
export async function getTicketViewData(segment: string) {
  const user = await getUser();
  if (!user) redirect('/signin');

  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();

  const participation = await getEventParticipation(eventId, user.id);
  if (!participation) {
    // A sub-event issues no pass of its own, so `getEventParticipation`
    // correctly returns null for one. Rather than 404 on a shared or
    // bookmarked link, send them to the ticket that does cover it — the
    // parent's, which is the pass they'd be scanned with anyway.
    const parentEventId = await getParentEventId(eventId);
    if (parentEventId) redirect(`/dashboard/events/${parentEventId}/ticket`);
    notFound();
  }
  if (!participation.isParticipant || !participation.checkInEnabled) notFound();

  return {
    eventId,
    eventName: participation.eventName,
    dateRangeLabel: formatDateRange(
      participation.startsAt,
      participation.endsAt,
    ),
    location: participation.location,
    participantName: participation.fullName ?? user.name,
  };
}
