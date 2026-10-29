import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { hasEventElapsed } from '@/lib/events';
import * as Signing from '@/lib/signing/server';
import * as Ticket from '@/lib/ticket/server';
import * as Wallet from '@/lib/wallet/server';
import { db } from '@/utils/db';

/**
 * A campaign email's wallet link: adds the recipient's pass with no sign-in.
 * The signed token names the user and event; eligibility (a held spot,
 * check-in on, the event not over) is checked now, not when the email was
 * sent, so a link from someone who has since declined just 404s.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const platform = new URL(request.url).searchParams.get('platform');
  if (platform !== 'apple' && platform !== 'google') {
    return new Response('Not found', { status: 404 });
  }

  const claims = await Signing.verifyWalletLinkToken(token);
  if (!claims) return new Response('Not found', { status: 404 });
  if (!(await Wallet.checkWalletRateLimit(claims.userId))) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const holder = await Ticket.passEligibility(claims.eventId, claims.userId);
  if (!holder || hasEventElapsed(holder.endsAt)) {
    return new Response('Not found', { status: 404 });
  }

  const [account] = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, claims.userId))
    .limit(1);
  if (!account) return new Response('Not found', { status: 404 });

  const input = {
    eventId: claims.eventId,
    userId: claims.userId,
    accountName: account.name,
    holder,
  };
  return platform === 'apple' ? Wallet.applePassResponse(input) : Wallet.googleWalletResponse(input);
}
