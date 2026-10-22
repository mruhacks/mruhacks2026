import * as Wallet from '@/lib/wallet/server';
import { getUser } from '@/utils/auth';

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!(await Wallet.checkWalletRateLimit(user.id))) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const { eventId } = await params;
  const participation = await Wallet.walletParticipation(eventId, user.id);
  // Not-participant collapses into the same 404 as "no application at all"
  // rather than a 403, so this endpoint can't be used to probe whether a
  // given user has applied to a given event.
  if (!participation) return new Response('Not found', { status: 404 });

  return Wallet.applePassResponse({
    eventId,
    userId: user.id,
    accountName: user.name,
    participation,
  });
}
