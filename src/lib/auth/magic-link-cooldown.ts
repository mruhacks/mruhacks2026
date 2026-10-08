import 'server-only';

import { eq, lt, sql } from 'drizzle-orm';
import { after } from 'next/server';

import { magicLinkCooldown } from '@/db/schema';
import { db } from '@/utils/db';

/**
 * Claims the address's sign-in-link cooldown: true when nothing was sent to
 * it in the last minute (and records this send), false while it's still
 * cooling down. One atomic statement, so two concurrent senders can't both
 * win. Shared by the public sign-in form and organizer-sent judge invites.
 */
export async function claimMagicLinkCooldown(email: string): Promise<boolean> {
  const [allowed] = await db
    .insert(magicLinkCooldown)
    .values({ email })
    .onConflictDoUpdate({
      target: magicLinkCooldown.email,
      set: { lastSentAt: new Date() },
      where: lt(
        magicLinkCooldown.lastSentAt,
        sql`now() - interval '60 seconds'`,
      ),
    })
    .returning();

  // Self-cleaning: occasionally piggyback on a send to prune rows whose
  // cooldown has already lapsed, so the table doesn't grow forever without
  // needing a separate cron job. Probabilistic so a burst of sends doesn't
  // turn into a burst of cleanup deletes.
  // `after` throws outside a request (scripts, tests); pruning can wait.
  if (allowed && Math.random() < 0.1) {
    try {
      after(async () => {
        await db
          .delete(magicLinkCooldown)
          .where(
            lt(
              magicLinkCooldown.lastSentAt,
              sql`now() - interval '60 seconds'`,
            ),
          );
      });
    } catch {}
  }
  return allowed != null;
}

/** Gives a claimed cooldown back after the send failed, so a retry isn't blocked. */
export async function releaseMagicLinkCooldown(email: string): Promise<void> {
  await db.delete(magicLinkCooldown).where(eq(magicLinkCooldown.email, email));
}
