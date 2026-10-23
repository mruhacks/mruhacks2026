import { and, eq } from 'drizzle-orm';
import QRCode from 'qrcode';

import { eventJudges } from '@/db/schema';
import { checkJudgeInviteRateLimit } from '@/lib/judging/invite-rate-limit';
import { createJudgeSignInLink } from '@/lib/judging/judge-invite';
import { JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS } from '@/lib/judging/signin-qr';
import { hasPermission } from '@/lib/rbac/authorization';
import { getUser } from '@/utils/auth';
import { writeAuditLog } from '@/utils/audit-log';
import { db } from '@/utils/db';

/**
 * Whether the request is a prefetch rather than the `<img>` actually loading:
 * Next's router (`Next-Router-Prefetch`), the Speculation Rules API and
 * `<link rel="prefetch">` (`Sec-Purpose`), or older browsers' `Purpose` /
 * `X-Purpose` / `X-Moz`.
 */
function isPrefetch(request: Request): boolean {
  const { headers } = request;
  if (headers.has('next-router-prefetch')) return true;
  return ['sec-purpose', 'purpose', 'x-purpose', 'x-moz'].some((name) =>
    /prefetch|prerender|preview/i.test(headers.get(name) ?? ''),
  );
}

/**
 * An SVG QR code of a single-use magic link that signs whoever scans it in as
 * the judge, for a judge at the expo who can't get to their invite email.
 * The sign-in QR page points an `<img>` straight at this route, and nothing
 * may prefetch it; see `isPrefetch`.
 *
 * As good as the judge's password while it lasts, so it has its own
 * permission (`judging:signin:all`), every one is audited, and it's held to
 * the organizer's invite rate limit. Each request mints a new link, and the
 * response is never cached.
 */
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string; judgeId: string }> }) {
  // Each request mints a live link, so a speculative fetch must never get
  // one. Refused before the rate limit, so it doesn't use up a slot either.
  if (isPrefetch(request)) {
    return new Response('Prefetch not allowed', { status: 403 });
  }

  const { eventId, judgeId } = await params;

  const admin = await getUser();
  if (!admin) return new Response('Unauthorized', { status: 401 });
  if (!(await hasPermission(admin.id, 'judging:signin:all'))) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!(await checkJudgeInviteRateLimit(admin.id))) {
    return new Response('Too Many Requests', { status: 429 });
  }

  const [row] = await db
    .select({ email: eventJudges.email, disabledAt: eventJudges.disabledAt })
    .from(eventJudges)
    .where(and(eq(eventJudges.id, judgeId), eq(eventJudges.eventId, eventId)))
    .limit(1);
  // A deleted account has nothing left to sign in to.
  if (!row?.email) return new Response('Not found', { status: 404 });
  if (row.disabledAt) return new Response('Judge disabled', { status: 409 });

  let svg: string;
  try {
    const url = await createJudgeSignInLink(row.email);
    svg = await QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'medium',
      margin: 1,
    });
  } catch (error) {
    console.error('[admin/judging/signin-qr] judge sign-in QR failed', error);
    return new Response('Could not generate QR code', { status: 500 });
  }
  const expiresAt = new Date(Date.now() + JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS * 1000);

  await writeAuditLog({
    actorId: admin.id,
    action: 'judging.judge.signin_qr_created',
    targetType: 'event_judge',
    targetId: judgeId,
    metadata: { eventId, email: row.email, expiresAt: expiresAt.toISOString() },
  });

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'private, no-store',
    },
  });
}
