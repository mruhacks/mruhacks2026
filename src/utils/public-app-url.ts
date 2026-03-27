/**
 * Absolute origin for in-app redirects (password reset `redirectTo`, sign-up
 * `callbackURL`, etc.). Prefer `NEXT_PUBLIC_BETTER_AUTH_URL` so it matches
 * Better Auth `baseURL` / `BETTER_AUTH_URL`; in the browser, fall back to
 * `window.location.origin` when the env is unset.
 */
export function getPublicAppOrigin(): string {
  const v = process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim();
  if (v) return v.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  throw new Error(
    'NEXT_PUBLIC_BETTER_AUTH_URL is required outside the browser for absolute URLs',
  );
}

/** Build an absolute URL for a same-origin path (leading slash). */
export function publicAppAbsoluteUrl(path: string): string {
  const base = getPublicAppOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  return new URL(p, `${base}/`).toString();
}
