/** Where Better Auth is mounted; also passed as `basePath` in `src/utils/auth.ts`. */
export const BASE_PATH = '/api/auth';

/** Our interstitial page; a GET here only renders a "Continue" button. */
export const EMAIL_LINK_CONFIRM_PATH = '/signin/verify';

/**
 * Emailed Better Auth links whose GET has a side effect: a magic link spends
 * its single-use token, and a verify-email link signs in whoever opens it
 * first (`autoSignInAfterVerification`). `params` are the query params the
 * confirm page forwards to `endpoint`.
 */
export const EMAIL_LINKS = {
  'magic-link': {
    endpoint: `${BASE_PATH}/magic-link/verify`,
    params: ['token', 'callbackURL', 'newUserCallbackURL'],
  },
  'verify-email': {
    endpoint: `${BASE_PATH}/verify-email`,
    params: ['token', 'callbackURL'],
  },
} as const;

export type EmailLinkKind = keyof typeof EMAIL_LINKS;

/** Confirm-page param naming which `EMAIL_LINKS` entry the link is for. */
export const EMAIL_LINK_KIND_PARAM = 'link';

/** Set on the confirm page when Better Auth bounced back a failed magic link. */
export const EMAIL_LINK_FAILED_PARAM = 'failed';

export function isEmailLinkKind(value: unknown): value is EmailLinkKind {
  return typeof value === 'string' && Object.hasOwn(EMAIL_LINKS, value);
}

/**
 * Rewrites a Better Auth link to point at the confirm page instead, keeping
 * the query string. Corporate link scanners (Safe Links, Proofpoint, Mimecast)
 * GET every URL in an email before the recipient sees it; pointed straight at
 * the endpoint, that GET burns the token or hands the scanner a session. The
 * confirm page only follows the link on a form submit, which scanners don't do.
 *
 * If Better Auth built the link somewhere other than `endpoint` (its base path
 * changed), the confirm page would submit to a 404, so the raw link is sent
 * instead and the mismatch logged.
 */
export function toEmailLinkConfirmUrl(kind: EmailLinkKind, authUrl: string): string {
  const url = new URL(authUrl);
  const { endpoint } = EMAIL_LINKS[kind];
  if (url.pathname !== endpoint) {
    console.error(`[auth] ${kind} link points at ${url.pathname}, expected ${endpoint}; sending it unwrapped`);
    return authUrl;
  }
  url.pathname = EMAIL_LINK_CONFIRM_PATH;
  url.searchParams.set(EMAIL_LINK_KIND_PARAM, kind);
  return url.toString();
}

/**
 * Where Better Auth sends a failed magic link, overriding the sender's own
 * target: those are protected pages that would bounce a signed-out user to a
 * bare sign-in screen. A signed-in user never sees it; the proxy sends them on.
 */
export const MAGIC_LINK_ERROR_CALLBACK_URL = `${EMAIL_LINK_CONFIRM_PATH}?${EMAIL_LINK_FAILED_PARAM}=1`;

/**
 * `value` as a same-origin path, or null. Guards the proxy's redirect to a
 * link's `callbackURL`, which arrives as an untrusted query param.
 */
export function toSameOriginPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  const base = 'http://placeholder.invalid';
  const url = new URL(value, base);
  if (url.origin !== base) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
