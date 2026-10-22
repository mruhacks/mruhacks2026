import { eq } from 'drizzle-orm';

import { user } from '@/db/schema';
import { verifyWalletLinkToken } from '@/lib/signing/email-tokens';
import { checkWalletRateLimit } from '@/lib/wallet/rate-limit';
import {
  applePassResponse,
  googleWalletResponse,
  walletParticipation,
} from '@/lib/wallet/wallet-responses';
import { db } from '@/utils/db';

/**
 * A campaign email's wallet link: adds the recipient's pass with no sign-in.
 * The signed token names the user and event; eligibility (a held spot,
 * check-in on, the event not over) is checked now, not when the email was
 * sent, so a link from someone who has since declined just 404s.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const platform = new URL(request.url).searchParams.get('platform');
  if (platform !== 'apple' && platform !== 'google') {
    return new Response('Not found', { status: 404 });
  }

  const claims = await verifyWalletLinkToken(token);
  if (!claims) return new Response('Not found', { status: 404 });
  if (!(await checkWalletRateLimit(claims.userId))) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const participation = await walletParticipation(
    claims.eventId,
    claims.userId,
  );
  if (
    !participation ||
    (participation.endsAt && participation.endsAt.getTime() < Date.now())
  ) {
    return new Response('Not found', { status: 404 });
  }

  const [account] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, claims.userId))
    .limit(1);
  if (!account) return new Response('Not found', { status: 404 });

  const input = {
    eventId: claims.eventId,
    userId: claims.userId,
    accountName: account.name,
    participation,
  };
  return platform === 'apple'
    ? applePassResponse(input)
    : googleWalletResponse(input);
}
