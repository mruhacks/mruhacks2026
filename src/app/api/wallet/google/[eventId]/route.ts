import {
  buildCheckInPayload,
  DEFAULT_QR_TTL_MS,
} from '@/lib/wallet/check-in-token';
import { buildGoogleWalletSaveUrl } from '@/lib/wallet/google/event-ticket';
import { getEventParticipation } from '@/lib/wallet/participation';
import { getUser } from '@/utils/auth';

/**
 * Redirects to Google's "Save to Wallet" flow for this participant's ticket.
 * Same authorization and check-in payload as the Apple pass / QR code.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { eventId } = await params;
  const participation = await getEventParticipation(eventId, user.id);
  if (!participation) return new Response('Not found', { status: 404 });
  if (!participation.isParticipant) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const expiresAt =
      participation.endsAt ?? new Date(Date.now() + DEFAULT_QR_TTL_MS);
    const name = participation.fullName ?? user.name;
    const checkInPayload = buildCheckInPayload(
      eventId,
      user.id,
      name,
      expiresAt,
    );

    const saveUrl = await buildGoogleWalletSaveUrl({
      eventId,
      userId: user.id,
      name,
      eventName: participation.eventName,
      startsAt: participation.startsAt,
      endsAt: participation.endsAt,
      location: participation.location,
      checkInPayload,
    });

    return Response.redirect(saveUrl, 302);
  } catch (error) {
    console.error('[wallet] failed to build Google Wallet save link', error);
    return new Response('Could not generate Google Wallet pass', {
      status: 500,
    });
  }
}
