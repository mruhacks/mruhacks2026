/**
 * Next.js 16 proxy (network-boundary) — optimistic session cookie check only.
 *
 * Uses `getSessionCookie` from Better Auth (no DB). Unauthenticated users are
 * sent to `/signin` with a same-origin-safe `callbackUrl`. Email verification
 * and full session validation stay in server components — see `requireVerifiedUser`
 * in `@/utils/auth` (e.g. dashboard layout).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Same-origin path for `callbackUrl` (aligned with `sanitizeInternalNextPath` in
 * `@/utils/post-auth-redirect`). Inlined here so this module does not import
 * server-only graphs into the proxy bundle.
 */
function sanitizeCallbackPath(fullPath: string): string | undefined {
  const trimmed = fullPath.trim();
  if (!trimmed.startsWith('/')) return undefined;
  if (trimmed.startsWith('//')) return undefined;
  if (/[\r\n\\]/.test(trimmed)) return undefined;
  if (trimmed.toLowerCase().startsWith('javascript:')) return undefined;
  return trimmed;
}

export async function proxy(request: NextRequest) {
  // Default cookie name/prefix matches `betterAuth({ ... })` in `@/utils/auth` (no custom
  // `cookiePrefix` / `cookieName` today). If those are added, pass the same `config` here.
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const url = new URL(request.url);
    const raw = url.pathname + url.search;
    const fallback = url.pathname.startsWith('/register')
      ? '/register'
      : '/dashboard';
    const safe = sanitizeCallbackPath(raw) ?? fallback;
    const signin = new URL('/signin', request.url);
    signin.searchParams.set('callbackUrl', safe);
    return NextResponse.redirect(signin);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/register', '/register/:path*'],
};
