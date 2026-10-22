import * as Wallet from '@/lib/wallet/server';
import { getUser } from '@/utils/auth';

/**
 * Redirects to Google's "Save to Wallet" flow for this participant's ticket.
 * Same authorization and check-in payload as the Apple pass / QR code.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!(await Wallet.checkWalletRateLimit(user.id))) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const { eventId } = await params;
  const participation = await Wallet.walletParticipation(eventId, user.id);
  if (!participation) return new Response('Not found', { status: 404 });

  return Wallet.googleWalletResponse({
    eventId,
    userId: user.id,
    accountName: user.name,
    participation,
  });
}
