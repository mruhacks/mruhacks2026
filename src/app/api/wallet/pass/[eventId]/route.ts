import { checkWalletRateLimit } from '@/lib/wallet/rate-limit';
import {
  applePassResponse,
  walletParticipation,
} from '@/lib/wallet/wallet-responses';
import { getUser } from '@/utils/auth';

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
  const participation = await walletParticipation(eventId, user.id);
  // Not-participant collapses into the same 404 as "no application at all"
  // rather than a 403, so this endpoint can't be used to probe whether a
  // given user has applied to a given event.
  if (!participation) return new Response('Not found', { status: 404 });

  return applePassResponse({
    eventId,
    userId: user.id,
    accountName: user.name,
    participation,
  });
}
