import 'server-only';

import { buildCheckInPayload } from './check-in-token';
import { generateParticipantPass } from './generate-pass';
import { buildGoogleWalletSaveUrl } from './google/event-ticket';
import { getEventParticipation, resolveParticipantName, type EventParticipation } from './participation';

/**
 * The wallet endpoints' shared work once the caller is known — the signed-in
 * user for `/api/wallet/{pass,google}/[eventId]`, or the signed user in a
 * campaign email's wallet link — so the two entry points can't drift on who
 * gets a pass or what's in it.
 */

/**
 * The participation, or null when this user shouldn't get a pass: unknown or
 * sub-event, no held spot, or check-in off. Callers answer null with the
 * same 404 either way, so the endpoint can't be used to probe applications.
 */
export async function walletParticipation(eventId: string, userId: string): Promise<EventParticipation | null> {
  const participation = await getEventParticipation(eventId, userId);
  if (!participation || !participation.isParticipant || !participation.checkInEnabled) {
    return null;
  }
  return participation;
}

export async function applePassResponse(input: {
  eventId: string;
  userId: string;
  accountName: string;
  participation: EventParticipation;
}): Promise<Response> {
  const { eventId, userId, participation } = input;
  try {
    const pass = await generateParticipantPass({
      eventId,
      userId,
      name: resolveParticipantName(participation.fullName, input.accountName),
      role: 'Participant',
      eventName: participation.eventName,
      startsAt: participation.startsAt,
      endsAt: participation.endsAt,
      location: participation.location,
      latitude: participation.latitude,
      longitude: participation.longitude,
      radiusMeters: participation.radiusMeters,
      expiresAt: participation.endsAt,
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
  participation: EventParticipation;
}): Promise<Response> {
  const { eventId, userId, participation } = input;
  try {
    const saveUrl = await buildGoogleWalletSaveUrl({
      eventId,
      userId,
      name: resolveParticipantName(participation.fullName, input.accountName),
      eventName: participation.eventName,
      startsAt: participation.startsAt,
      endsAt: participation.endsAt,
      location: participation.location,
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
