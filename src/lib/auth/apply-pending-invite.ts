import { eq } from 'drizzle-orm';

import { invite, user } from '@/db/schema';
import { replaceUserRoles } from '@/lib/rbac/role-mutations';
import { db } from '@/utils/db';

/**
 * Applies the roles an admin chose in `inviteUser` to the account that now
 * owns the invited email, then deletes the invite. Called on every sign-in so
 * roles are in place before the first /welcome render decides which
 * onboarding steps to show. An expired invite is dropped without applying
 * anything. Returns whether one was applied.
 *
 * Only a verified email can claim an invite: an admin impersonating an
 * unverified account gets a session without anyone proving they own the
 * address.
 */
export async function applyPendingInvite(userId: string): Promise<boolean> {
  const [owner] = await db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!owner?.emailVerified) return false;

  const email = owner.email.toLowerCase();
  const [row] = await db
    .select({ roleIds: invite.roleIds, expiresAt: invite.expiresAt })
    .from(invite)
    .where(eq(invite.email, email))
    .limit(1);
  if (!row) return false;

  const live = row.expiresAt > new Date();
  if (live && row.roleIds.length > 0) {
    await replaceUserRoles(userId, row.roleIds);
  }
  await db.delete(invite).where(eq(invite.email, email));
  return live;
}
