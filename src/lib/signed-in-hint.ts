/**
 * A readable (non-httpOnly) cookie that only says "this browser probably has
 * a session". It carries no credentials and grants nothing — the session
 * cookie itself stays httpOnly. Its only job is letting the public landing
 * page skip `/api/auth/get-session` for visitors who have never signed in,
 * which is most of them, while that page stays static.
 *
 * Set when Better Auth issues a session, refreshed by the proxy on protected
 * navigations, cleared on sign-out. A stale hint costs one session check and
 * is then cleared client-side.
 */
export const SIGNED_IN_HINT_COOKIE = 'mruhacks.signed_in';

/** Outlives an idle session (Better Auth's default lifetime is 7 days). */
export const SIGNED_IN_HINT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const signedInHintCookieOptions = {
  path: '/',
  sameSite: 'lax',
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  maxAge: SIGNED_IN_HINT_MAX_AGE_SECONDS,
} as const;

/** Browser-only: whether the hint cookie is present. */
export function hasSignedInHint(): boolean {
  return document.cookie
    .split('; ')
    .some((c) => c.startsWith(`${SIGNED_IN_HINT_COOKIE}=`));
}

/** Browser-only: keeps the hint in sync with what `useSession` resolved. */
export function syncSignedInHint(signedIn: boolean): void {
  const { path, sameSite, secure, maxAge } = signedInHintCookieOptions;
  const attrs = `; Path=${path}; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
  document.cookie = signedIn
    ? `${SIGNED_IN_HINT_COOKIE}=1${attrs}; Max-Age=${maxAge}`
    : `${SIGNED_IN_HINT_COOKIE}=${attrs}; Max-Age=0`;
}
