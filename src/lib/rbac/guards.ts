/**
 * High-level RBAC guards for server components, layouts, and route handlers.
 *
 * These guards combine session lookup with permission/role checks and
 * redirect to /signin or /forbidden as appropriate. They return the
 * authenticated user so callers can use it directly.
 */

import { redirect } from 'next/navigation';
import { getUser } from '@/utils/auth';
import {
  hasAnyPermission,
  hasRole,
  getUserPermissions,
} from '@/app/actions/authz';

type User = NonNullable<Awaited<ReturnType<typeof getUser>>>;

/**
 * Require an authenticated session. Redirects to /signin if missing.
 */
export async function requireAuth(redirectTo = '/signin'): Promise<User> {
  const user = await getUser();
  if (!user) redirect(redirectTo);
  return user;
}

/**
 * Require a session AND at least one of the provided permissions.
 * Redirects to /signin if unauthenticated, /forbidden if unauthorized.
 */
export async function requireAuthWithPermission(
  permissions: string | string[],
): Promise<User> {
  const user = await requireAuth();
  const perms = Array.isArray(permissions) ? permissions : [permissions];
  const ok = await hasAnyPermission(user.id, perms);
  if (!ok) {
    redirect(
      `/forbidden?reason=missing_permission&permission=${encodeURIComponent(
        perms.join(','),
      )}`,
    );
  }
  return user;
}

/**
 * Require a session AND a specific role slug.
 */
export async function requireAuthWithRole(roleSlug: string): Promise<User> {
  const user = await requireAuth();
  const ok = await hasRole(user.id, roleSlug);
  if (!ok) {
    redirect(
      `/forbidden?reason=missing_role&role=${encodeURIComponent(roleSlug)}`,
    );
  }
  return user;
}

/**
 * Resolve the authenticated user's permissions as a Set. Redirects to
 * /signin if unauthenticated. Useful for conditionally rendering UI.
 */
export async function getAuthenticatedUserPermissions(): Promise<{
  user: User;
  permissions: Set<string>;
}> {
  const user = await requireAuth();
  const res = await getUserPermissions(user.id);
  return { user, permissions: res.success && res.data ? res.data : new Set() };
}
