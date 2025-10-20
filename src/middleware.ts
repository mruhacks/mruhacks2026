/**
 * Next.js middleware for route protection
 * 
 * This middleware intercepts requests to protected routes and ensures
 * the user is authenticated. Unauthenticated users are redirected to
 * the /forbidden page.
 * 
 * Protected routes are defined in the config.matcher below.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "./utils/auth";

/**
 * Middleware function that protects routes from unauthenticated access
 * 
 * @param request - The incoming Next.js request
 * @returns NextResponse allowing the request to proceed or redirecting to /forbidden
 */
export async function middleware(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Redirect to forbidden page if user is not authenticated
  if (!session) {
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }
  
  return NextResponse.next();
}

/**
 * Middleware configuration
 * 
 * - runtime: "nodejs" - Run middleware in Node.js runtime
 * - matcher: Routes that should be protected by this middleware
 */
export const config = {
  runtime: "nodejs",
  matcher: ["/dashboard"], // Apply middleware to dashboard routes
};
