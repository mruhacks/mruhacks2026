import { redirect } from 'next/navigation';

import { getUserProfile } from '@/app/dashboard/profile/actions';
import { requireVerifiedUser } from '@/utils/auth';

const DEFAULT_POST_PROFILE_DESTINATION = '/dashboard/events';

/**
 * Normalizes `searchParams.next` and returns a safe same-origin path, or undefined.
 */
export function sanitizeInternalNextPath(
  raw: string | string[] | undefined | null,
): string | undefined {
  if (raw == null) return undefined;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== 'string' || !s) return undefined;
  const trimmed = s.trim();
  if (!trimmed.startsWith('/')) return undefined;
  if (trimmed.startsWith('//')) return undefined;
  if (/[\r\n\\]/.test(trimmed)) return undefined;
  if (trimmed.toLowerCase().startsWith('javascript:')) return undefined;
  return trimmed;
}

type ResolvePostAuthRedirectArgs = {
  next?: string | string[] | null;
};

/**
 * After verified session: send users without a profile to complete profile (with a
 * safe `next`), or to events / optional `next` when a profile exists.
 */
export async function resolvePostAuthRedirect(
  args: ResolvePostAuthRedirectArgs = {},
): Promise<never> {
  await requireVerifiedUser();

  const profileResult = await getUserProfile();
  if (!profileResult.success) {
    redirect('/signin');
  }

  const safeNext = sanitizeInternalNextPath(args.next);

  if (profileResult.data == null) {
    const nextParam = safeNext ?? DEFAULT_POST_PROFILE_DESTINATION;
    redirect(`/dashboard/profile?next=${encodeURIComponent(nextParam)}`);
  }

  if (safeNext != null) {
    redirect(safeNext);
  }

  redirect(DEFAULT_POST_PROFILE_DESTINATION);
}
