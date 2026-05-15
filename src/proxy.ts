/**
 * Next.js middleware for route protection
 *
 * This middleware intercepts requests to protected routes and ensures
 * the user is authenticated. Unauthenticated users are redirected to
 * the /forbidden page.
 *
 * Protected routes are defined in the config.matcher below.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { auth } from './utils/auth';

/**
 * Middleware function that protects routes from unauthenticated access
 * TODO: This makes a network call, do we actually want/need that?
 * 
 * @param request - The incoming Next.js request
 * @returns NextResponse allowing the request to proceed or redirecting to /forbidden
 */
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.redirect(new URL('/signin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
