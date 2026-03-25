/**
 * Client-side authentication utilities
 *
 * This module provides the Better Auth client instance for use in
 * client-side React components. It enables authentication operations
 * like sign in, sign up, and sign out from the browser.
 *
 * @example
 * ```tsx
 * import { authClient } from '@/utils/auth-client';
 *
 * // In a component
 * const handleSignOut = async () => {
 *   await authClient.signOut();
 * };
 * ```
 */

import { createAuthClient } from 'better-auth/react';

function getPublicAuthBaseURL(): string | undefined {
  const v = process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim();
  if (!v) return undefined;
  return v.replace(/\/$/, '');
}

/**
 * Better Auth client instance for client-side authentication
 *
 * This client provides methods for:
 * - signIn: Authenticate a user
 * - signUp: Sign up a new user (create account)
 * - signOut: End the user's session
 * - useSession: React hook to access the current session
 *
 * When `NEXT_PUBLIC_BETTER_AUTH_URL` is set (same value as `BETTER_AUTH_URL` in typical setups),
 * requests target that origin explicitly. When omitted, the client uses the current page origin.
 */
const publicAuthBaseURL = getPublicAuthBaseURL();

export const authClient = createAuthClient(
  publicAuthBaseURL !== undefined ? { baseURL: publicAuthBaseURL } : {},
);
