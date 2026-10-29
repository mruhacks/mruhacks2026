import 'server-only';

import type * as Ticket from '@/lib/ticket';
import { buildCheckInPayload } from './check-in-token';
import { resolveParticipantName } from './format';
import { generateParticipantPass } from './generate-pass';
import { buildGoogleWalletSaveUrl } from './google/event-ticket';

/**
 * The wallet endpoints' shared work once the caller is known — the signed-in
 * user for `/api/wallet/{pass,google}/[eventId]`, or the signed user in a
 * campaign email's wallet link — and found eligible by
 * `Ticket.passEligibility`, so the two entry points can't drift on what's in
 * a pass.
 */

export async function applePassResponse(input: {
  eventId: string;
  userId: string;
  accountName: string;
  holder: Ticket.Holder;
}): Promise<Response> {
  const { eventId, userId, holder } = input;
  try {
    const pass = await generateParticipantPass({
      eventId,
      userId,
      name: resolveParticipantName(holder.fullName, input.accountName),
      role: 'Participant',
      eventName: holder.eventName,
      startsAt: holder.startsAt,
      endsAt: holder.endsAt,
      location: holder.location,
      latitude: holder.latitude,
      longitude: holder.longitude,
      radiusMeters: holder.radiusMeters,
      expiresAt: holder.endsAt,
    });

    return new Response(new Uint8Array(pass), {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': 'attachment; filename="MRUHacks.pkpass"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[wallet/pass] failed to generate pass', error);
    return new Response('Could not generate pass', { status: 500 });
  }
}

/** Redirects to Google's "Save to Wallet" flow, with the same check-in payload as the Apple pass / QR code. */
export async function googleWalletResponse(input: {
  eventId: string;
  userId: string;
  accountName: string;
  holder: Ticket.Holder;
}): Promise<Response> {
  const { eventId, userId, holder } = input;
  try {
    const saveUrl = await buildGoogleWalletSaveUrl({
      eventId,
      userId,
      name: resolveParticipantName(holder.fullName, input.accountName),
      eventName: holder.eventName,
      startsAt: holder.startsAt,
      endsAt: holder.endsAt,
      location: holder.location,
      checkInPayload: buildCheckInPayload(eventId, userId),
    });
    return Response.redirect(saveUrl, 302);
  } catch (error) {
    console.error('[wallet/google] failed to build save link', error);
    return new Response('Could not generate Google Wallet pass', {
      status: 500,
    });
  }
}
