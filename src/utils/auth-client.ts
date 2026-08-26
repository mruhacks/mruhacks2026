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
import { adminClient, magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [adminClient(), magicLinkClient()],
});
