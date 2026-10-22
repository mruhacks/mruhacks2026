import { unsubscribeByToken } from '@/lib/campaigns/unsubscribe';

/**
 * RFC 8058 one-click unsubscribe: the target of a marketing email's
 * `List-Unsubscribe` header. Mail providers POST
 * `List-Unsubscribe=One-Click` here with no cookies and no page.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const outcome = await unsubscribeByToken(token);
  if (outcome === 'invalid') {
    return new Response('Invalid unsubscribe link', { status: 400 });
  }
  // An address with no account is answered the same as a success: there's
  // nothing to unsubscribe, and the response shouldn't reveal which it was.
  return new Response('Unsubscribed', { status: 200 });
}

/**
 * Someone opened the header's link in a browser. A GET must never
 * unsubscribe (mail scanners prefetch links), so send them to the page with
 * the button.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL('/unsubscribe', url);
  const token = url.searchParams.get('t');
  if (token) target.searchParams.set('t', token);
  return Response.redirect(target, 303);
}
