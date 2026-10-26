import 'server-only';

import { and, asc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import * as schema from '@/db/schema';
import * as Judging from '@/lib/judging/server';
import * as Wallet from '@/lib/wallet/server';
import { db } from '@/utils/db';
import { deleteObject, parseOwnedProfilePictureKey } from '@/utils/object-storage';

/**
 * Work that has to happen just before a `user` row is deleted, whichever path
 * deletes it (self-service via Better Auth's `deleteUser`, an admin delete,
 * or a compliance purge).
 *
 * Deleting the row removes the person's PII by cascade — profile, interests,
 * dietary restrictions, registrations and answers, check-ins, team
 * memberships, editor presence. What they made with others stays, without
 * their name: project submissions (`lastEditedBy` → null) and review votes
 * (`voterId` → null). The FKs do that on their own; this handles what they
 * can't:
 *
 * - Judge roster rows keep their votes and reliability grouped, so they stay
 *   — but lose the email as well as the user link (the FK clears that), and
 *   show as "Deleted judge #…". That includes a roster row still waiting to
 *   be linked by their email.
 * - Rows keyed by their email rather than their id: a pending invite, the
 *   magic-link cooldown, and unexpired sign-in / deletion tokens.
 * - Teams they organize pass to the earliest-joined remaining member, the
 *   same rule as leaving a team. (`organizerId` is `set null` only as the
 *   backstop for a team left empty.)
 * - A team they were the last member of is dissolved — unless it holds a
 *   submission, in which case it stays, empty, to keep the project.
 * - Their objects outside the database (profile picture, resume) and their
 *   Google Wallet passes, which carry their name on Google's servers.
 */
export async function prepareUserDeletion(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [account] = await tx
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    if (account) await clearEmailKeyedRows(tx, userId, account.email);

    const memberships = await tx
      .select({ teamId: schema.teamMembers.teamId, organizerId: schema.teams.organizerId })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
      .where(eq(schema.teamMembers.userId, userId));

    for (const { teamId, organizerId } of memberships) {
      const [nextOrganizer] = await tx
        .select({ userId: schema.teamMembers.userId })
        .from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.teamId, teamId), ne(schema.teamMembers.userId, userId)))
        .orderBy(asc(schema.teamMembers.joinedAt))
        .limit(1);

      if (nextOrganizer) {
        if (organizerId === userId) {
          await tx.update(schema.teams).set({ organizerId: nextOrganizer.userId }).where(eq(schema.teams.id, teamId));
        }
        continue;
      }

      const [submission] = await tx
        .select({ id: schema.submissions.id })
        .from(schema.submissions)
        .where(eq(schema.submissions.teamId, teamId))
        .limit(1);
      if (!submission) await tx.delete(schema.teams).where(eq(schema.teams.id, teamId));
    }
  });

  await Promise.all([deleteUserObjects(userId), revokeWalletPasses(userId)]);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function clearEmailKeyedRows(tx: Tx, userId: string, email: string): Promise<void> {
  const lowered = email.trim().toLowerCase();
  const sameEmail = (column: AnyPgColumn) => sql`lower(${column}) = ${lowered}`;

  await tx
    .update(schema.eventJudges)
    .set({ email: null })
    .where(Judging.rosterMatch({ id: userId, email }));
  await tx.delete(schema.invite).where(sameEmail(schema.invite.email));
  await tx.delete(schema.magicLinkCooldown).where(sameEmail(schema.magicLinkCooldown.email));

  // Better Auth stores a magic link as `{"email":…,"name":…}` and the
  // delete-account / password-reset tokens as the bare user id.
  const magicLinkValue = JSON.stringify({ email: lowered });
  await tx
    .delete(schema.verification)
    .where(
      or(
        eq(schema.verification.value, userId),
        sql`lower(${schema.verification.value}) = ${magicLinkValue}`,
        sql`starts_with(lower(${schema.verification.value}), ${magicLinkValue.slice(0, -1) + ','})`,
      ),
    );
}

/** Best effort, like the storage cleanup: Google being down must not block the erasure. */
async function revokeWalletPasses(userId: string): Promise<void> {
  try {
    // Passes are only issued for top-level events.
    const rows = await db
      .select({ eventId: schema.eventParticipants.eventId })
      .from(schema.eventParticipants)
      .innerJoin(schema.events, eq(schema.events.id, schema.eventParticipants.eventId))
      .where(and(eq(schema.eventParticipants.userId, userId), isNull(schema.events.parentEventId)));
    await Wallet.revokeGoogleWalletPasses(
      userId,
      rows.map((r) => r.eventId),
    );
  } catch (error) {
    console.error('[account-deletion] failed to revoke wallet passes', error);
  }
}

/** Best effort: a storage failure must not block the erasure itself. */
async function deleteUserObjects(userId: string): Promise<void> {
  try {
    const [profile] = await db
      .select({ resumeFile: schema.userProfiles.resumeFile })
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.userId, userId))
      .limit(1);
    const [row] = await db
      .select({ image: schema.user.image })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    const pictureKey = parseOwnedProfilePictureKey(row?.image, userId);
    await Promise.all([
      pictureKey ? deleteObject(pictureKey) : Promise.resolve(),
      profile?.resumeFile ? deleteObject(profile.resumeFile) : Promise.resolve(),
    ]);
  } catch (error) {
    console.error('[account-deletion] failed to delete user files', error);
  }
}
