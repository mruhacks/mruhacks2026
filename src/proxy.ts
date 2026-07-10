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
 *   3. Admin routes are additionally guarded by `src/lib/rbac/guards.ts`
 *      inside the admin layout, which performs the DB-backed permission
 *      check. Doing that here would duplicate work and require pulling
 *      Drizzle into every request.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { auth } from './utils/auth';
import { userNeedsConsent } from './utils/consent-check';

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

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
  // Every authenticated surface. `/welcome` itself is intentionally excluded so
  // the consent redirect can't loop. `/signin` redirects active sessions from
  // its server component, so auth callbacks stay outside the proxy matcher.
  matcher: ['/dashboard/:path*'],
};
