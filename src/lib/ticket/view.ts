import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { getUser } from '@/utils/auth';
import { resolveEventId } from '@/lib/events';
import { getParentEventId } from '@/lib/subevents';
import * as Wallet from '@/lib/wallet/server';
import { isEligible, lookupHolder } from './eligibility';

/**
 * Shared by the full-page and intercepted-modal ticket routes so they can
 * never render different content for the same event/user.
 *
 * Takes the raw `[eventId]` route segment — uuid or custom slug — and returns
 * the resolved uuid, which is what the wallet and QR endpoints the ticket
 * card links to are keyed by.
 */
export async function getViewData(segment: string) {
  const user = await getUser();
  if (!user) redirect('/signin');

  const eventId = await resolveEventId(segment);
  if (!eventId) notFound();

  const holder = await lookupHolder(eventId, user.id);
  if (!holder) {
    // The event exists, so it's a sub-event, which issues no pass of its own.
    // Rather than 404 on a shared or bookmarked link, send them to the ticket
    // that does cover it — the parent's, which is the pass they'd be scanned
    // with anyway.
    const parentEventId = await getParentEventId(eventId);
    if (parentEventId) redirect(`/dashboard/events/${parentEventId}/ticket`);
    notFound();
  }
  if (!isEligible(holder)) notFound();

  return {
    eventId,
    eventName: holder.eventName,
    dateRangeLabel: Wallet.formatDateRange(holder.startsAt, holder.endsAt),
    location: holder.location,
    participantName: Wallet.resolveParticipantName(holder.fullName, user.name),
  };
}
