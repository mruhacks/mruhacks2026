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

/**
 * Better Auth client instance for client-side authentication
 *
 * This client provides methods for:
 * - signIn: Authenticate a user
 * - signUp: Register a new user
 * - signOut: End the user's session
 * - useSession: React hook to access the current session
 */
export const authClient = createAuthClient();
