import { redirect } from 'next/navigation';

import { getUserProfile } from '@/app/dashboard/profile/actions';
import { requireVerifiedUser } from '@/utils/auth';
import { sanitizeInternalNextPath } from '@/utils/sanitize-internal-next';

const DEFAULT_POST_PROFILE_DESTINATION = '/dashboard/events';

export { sanitizeInternalNextPath } from '@/utils/sanitize-internal-next';

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
