/**
 * Sanitizes a caller-supplied "return to" path so it can only ever point back
 * into this app. Guards against open-redirect attacks: an attacker who can set
 * `?returnUrl=` must not be able to bounce a user off-site (e.g.
 * `//evil.com`, `https://evil.com`, or `/\evil.com`).
 *
 * Returns the path unchanged when it is a safe same-origin absolute path,
 * otherwise falls back to `/dashboard`.
 */
export function sanitizeReturnPath(
  raw: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!raw) return fallback;
  // Must be an absolute path on this origin. Reject protocol-relative
  // (`//host`), backslash tricks (`/\host`), and anything not starting with a
  // single slash (which includes absolute URLs like `https://…`).
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}
