import 'server-only';

import { sql } from 'drizzle-orm';

import { marketingConsents, user } from '@/db/schema';
import {
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
} from '@/lib/signing/email-tokens';
import { writeAuditLog } from '@/utils/audit-log';
import { db } from '@/utils/db';
import type { SendMailOptions } from '@/utils/mail';
import {
  getAppBaseUrl,
  renderCampaignEmail,
  type BlockRenderers,
  type CampaignContent,
} from './render-campaign-email';

/**
 * Signed unsubscribe links for marketing email. The token carries only the
 * address and never expires; it turns off the one global marketing flag.
 *
 *   /unsubscribe?t=…       the footer link: a page with one button (a GET
 *                          must never unsubscribe — mail scanners open links)
 *   /api/unsubscribe?t=…   the List-Unsubscribe target: RFC 8058 one-click
 *                          POST unsubscribes with no page; a GET there just
 *                          redirects to the page above
 */

export async function unsubscribeUrls(
  email: string,
  baseUrl: string = getAppBaseUrl(),
): Promise<{ page: string; oneClick: string }> {
  const token = encodeURIComponent(await buildUnsubscribeToken(email));
  return {
    page: `${baseUrl}/unsubscribe?t=${token}`,
    oneClick: `${baseUrl}/api/unsubscribe?t=${token}`,
  };
}

export type UnsubscribeOutcome = 'unsubscribed' | 'no_account' | 'invalid';

/**
 * Opts the token's address out of marketing email. Idempotent: an address
 * that's already opted out just stays that way (its `changed_at` moves).
 */
export async function unsubscribeByToken(
  token: string,
): Promise<UnsubscribeOutcome> {
  const claims = await verifyUnsubscribeToken(token);
  if (!claims) return 'invalid';

  const [account] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${claims.email}`)
    .limit(1);
  if (!account) return 'no_account';

  const now = new Date();
  await db
    .insert(marketingConsents)
    .values({ userId: account.id, optedIn: false, changedAt: now })
    .onConflictDoUpdate({
      target: marketingConsents.userId,
      set: { optedIn: false, changedAt: now },
    });
  await writeAuditLog({
    actorId: null,
    action: 'marketing_consent.unsubscribe',
    targetType: 'user',
    targetId: account.id,
    metadata: { via: 'email_link' },
  });
  return 'unsubscribed';
}

/**
 * One recipient's ready-to-send message. Marketing email gets a signed
 * unsubscribe link in its footer plus the one-click `List-Unsubscribe`
 * headers; operational email gets neither.
 */
export async function buildCampaignMessage(
  content: CampaignContent,
  recipient: { email: string; firstName: string | null },
  options: { blocks?: BlockRenderers; subjectPrefix?: string } = {},
): Promise<SendMailOptions> {
  const baseUrl = getAppBaseUrl();
  const links =
    content.type === 'marketing'
      ? await unsubscribeUrls(recipient.email, baseUrl)
      : null;
  const email = await renderCampaignEmail(
    content,
    { firstName: recipient.firstName, unsubscribeUrl: links?.page ?? null },
    { baseUrl, blocks: options.blocks },
  );
  return {
    to: recipient.email,
    subject: `${options.subjectPrefix ?? ''}${email.subject}`,
    html: email.html,
    text: email.text,
    ...(links && { listUnsubscribeUrl: links.oneClick }),
  };
}
