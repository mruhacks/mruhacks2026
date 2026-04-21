/**
 * Next.js proxy (formerly middleware) for session-based route protection.
 *
 * Runs in the Node.js runtime so it can use the Better Auth server API
 * directly. This is the first line of defense:
 *
 *   1. Users with no session visiting `/dashboard/**` are redirected to
 *      `/signin`, preserving the original path in `?redirect=`.
 *   2. Admin routes are additionally guarded by `src/lib/rbac/guards.ts`
 *      inside the admin layout, which performs the DB-backed permission
 *      check. Doing that here would duplicate work and require pulling
 *      Drizzle into every request.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { auth } from './utils/auth';

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    const url = request.nextUrl.clone();
    const original = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = '/signin';
    url.searchParams.set('redirect', original);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/dashboard/:path*'],
};
