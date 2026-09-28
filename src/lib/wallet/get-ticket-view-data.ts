import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { getUser } from '@/utils/auth';
import { resolveEventId } from '@/lib/events';
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
  if (!participation || !participation.isParticipant) notFound();

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
