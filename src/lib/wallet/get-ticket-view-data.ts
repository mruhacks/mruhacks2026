import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { getUser } from '@/utils/auth';
import { formatDateRange } from './format';
import { getEventParticipation } from './participation';

/**
 * Shared by the full-page and intercepted-modal ticket routes so they can
 * never render different content for the same event/user.
 */
export async function getTicketViewData(eventId: string) {
  const user = await getUser();
  if (!user) redirect('/signin');

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
    // Cache-busts the QR <img> src: computed here (a plain function, not a
    // component render) since React's purity rules forbid calling Date.now()
    // during render. The route itself is never cached, but without a unique
    // URL per view, a prefetched or back-forward-cached page could still
    // show a QR image fetched before a since-changed name or event status.
    cacheBust: Date.now(),
  };
}
