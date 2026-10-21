/**
 * Next.js proxy (formerly middleware) for session-based route protection.
 *
 * Next.js 16 runs proxy on the Node.js runtime unconditionally, so we can
 * use the Better Auth server API directly. This is the first line of
 * defense:
 *
 *   1. Users with no session visiting a protected route are redirected to
 *      `/signin`, preserving the original path in `?redirect=`.
 *   2. Signed-in users who haven't accepted the current Terms of Use +
 *      Privacy Policy are redirected to `/welcome`, preserving the original
 *      path in `?returnUrl=` so they land back where they were headed once
 *      they consent. No authenticated page renders until consent is on record.
 *   3. Signed-in users visiting a sign-in page (`/signin`, the emailed-link
 *      confirm page, `/signup`) are sent on to the dashboard, or to where an
 *      emailed sign-in link was headed.
 *   4. Admin routes are additionally guarded by `src/lib/rbac/guards.ts`
 *      inside the admin layout, which performs the DB-backed permission
 *      check. Doing that here would duplicate work and require pulling
 *      Drizzle into every request.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { auth } from './utils/auth';
import { userNeedsConsent } from './utils/consent-check';
import {
  EMAIL_LINK_CONFIRM_PATH,
  EMAIL_LINK_KIND_PARAM,
  toSameOriginPath,
} from './lib/auth/email-link-confirm-url';

function isSignInPage(pathname: string): boolean {
  return (
    pathname === '/signin' ||
    pathname.startsWith('/signin/') ||
    pathname === '/signup'
  );
}

/** Where a signed-in user on a sign-in page goes instead, or null to stay. */
function signedInTarget(url: NextRequest['nextUrl']): string | null {
  if (url.pathname !== EMAIL_LINK_CONFIRM_PATH) return '/dashboard';
  // Verifying an email is still needed while signed in.
  if (url.searchParams.get(EMAIL_LINK_KIND_PARAM) === 'verify-email') {
    return null;
  }
  // An RSVP or judge link should still land on its event, not the dashboard.
  return toSameOriginPath(url.searchParams.get('callbackURL')) ?? '/dashboard';
}

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (isSignInPage(request.nextUrl.pathname)) {
    const target = session && signedInTarget(request.nextUrl);
    return target
      ? NextResponse.redirect(new URL(target, request.url))
      : NextResponse.next();
  }

  const original = request.nextUrl.pathname + request.nextUrl.search;

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.search = '';
    url.searchParams.set('redirect', original);
    return NextResponse.redirect(url);
  }

  if (await userNeedsConsent(session.user.id)) {
    const url = request.nextUrl.clone();
    url.pathname = '/welcome';
    url.search = '';
    url.searchParams.set('returnUrl', original);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Every authenticated surface, plus the sign-in pages (which redirect the
  // other way). `/welcome` itself is intentionally excluded so the consent
  // redirect can't loop. `/print` holds dashboard pages laid out for paper,
  // outside its chrome.
  matcher: ['/dashboard/:path*', '/print/:path*', '/signin/:path*', '/signup'],
};
