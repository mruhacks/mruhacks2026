/** Client-safe pieces of judge sign-in QR codes, shared by the route and the roster. */

/**
 * How long a judge sign-in QR code works. It's shown on an organizer's screen
 * rather than sent to the judge's own inbox, so it lasts only long enough to
 * be scanned.
 */
export const JUDGE_SIGNIN_LINK_EXPIRES_IN_SECONDS = 15 * 60;

/**
 * The route that mints a judge's sign-in link and serves it as an SVG QR
 * code. Every request mints a fresh link, so `nonce` keeps the browser from
 * reusing an image it already has for the same judge.
 */
export function judgeSignInQrPath(
  eventId: string,
  judgeId: string,
  nonce: string | number,
): string {
  return `/api/admin/events/${encodeURIComponent(eventId)}/judges/${encodeURIComponent(judgeId)}/signin-qr?n=${nonce}`;
}
