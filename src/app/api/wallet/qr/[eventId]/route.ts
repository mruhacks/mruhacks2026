import QRCode from 'qrcode';

import {
  buildCheckInToken,
  DEFAULT_QR_TTL_MS,
} from '@/lib/wallet/check-in-token';
import {
  getEventParticipation,
  resolveParticipantName,
} from '@/lib/wallet/participation';
import { checkWalletRateLimit } from '@/lib/wallet/rate-limit';
import { getUser } from '@/utils/auth';

/**
 * Standalone check-in QR code for participants who can't add the Apple
 * Wallet pass — same signed token as the pass's barcode, same authorization
 * (see /api/wallet/pass), just rendered as an SVG instead of embedded in a
 * .pkpass file. Encodes the raw 52-byte token directly in QR byte mode
 * (rather than a base64/hex text form of it), which keeps the resulting
 * code noticeably smaller/denser for the same error-correction level.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!(await checkWalletRateLimit(user.id))) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const { eventId } = await params;
  const participation = await getEventParticipation(eventId, user.id);
  if (!participation || !participation.isParticipant) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const expiresAt =
      participation.endsAt ?? new Date(Date.now() + DEFAULT_QR_TTL_MS);
    const token = buildCheckInToken(
      eventId,
      user.id,
      resolveParticipantName(participation.fullName, user.name),
      expiresAt,
    );
    const svg = await QRCode.toString([{ data: token, mode: 'byte' }], {
      type: 'svg',
      errorCorrectionLevel: 'medium',
      margin: 1,
    });

    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[wallet] failed to generate check-in QR code', error);
    return new Response('Could not generate QR code', { status: 500 });
  }
}
