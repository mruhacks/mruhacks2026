import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import * as Rbac from '@/lib/rbac/server';
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
    .select({ email: schema.user.email, emailVerified: schema.user.emailVerified })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  if (!owner?.emailVerified) return false;

  const email = owner.email.toLowerCase();
  const [row] = await db
    .select({ roleIds: schema.invite.roleIds, expiresAt: schema.invite.expiresAt })
    .from(schema.invite)
    .where(eq(schema.invite.email, email))
    .limit(1);
  if (!row) return false;

  const live = row.expiresAt > new Date();
  if (live && row.roleIds.length > 0) {
    await Rbac.replaceUserRoles(userId, row.roleIds);
  }
  await db.delete(schema.invite).where(eq(schema.invite.email, email));
  return live;
}
