import 'server-only';

import { and, asc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import {
  eventJudges,
  eventParticipants,
  events,
  invite,
  magicLinkCooldown,
  submissions,
  teamMembers,
  teams,
  user,
  userProfiles,
  verification,
} from '@/db/schema';
import { rosterMatch } from '@/lib/judging/server';
import { revokeGoogleWalletPasses } from '@/lib/wallet/google/event-ticket';
import { db } from '@/utils/db';
import {
  deleteObject,
  parseOwnedProfilePictureKey,
} from '@/utils/object-storage';

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
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (account) await clearEmailKeyedRows(tx, userId, account.email);

    const memberships = await tx
      .select({ teamId: teamMembers.teamId, organizerId: teams.organizerId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.userId, userId));

    for (const { teamId, organizerId } of memberships) {
      const [nextOrganizer] = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(
          and(eq(teamMembers.teamId, teamId), ne(teamMembers.userId, userId)),
        )
        .orderBy(asc(teamMembers.joinedAt))
        .limit(1);

      if (nextOrganizer) {
        if (organizerId === userId) {
          await tx
            .update(teams)
            .set({ organizerId: nextOrganizer.userId })
            .where(eq(teams.id, teamId));
        }
        continue;
      }

      const [submission] = await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.teamId, teamId))
        .limit(1);
      if (!submission) await tx.delete(teams).where(eq(teams.id, teamId));
    }
  });

  await Promise.all([deleteUserObjects(userId), revokeWalletPasses(userId)]);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function clearEmailKeyedRows(
  tx: Tx,
  userId: string,
  email: string,
): Promise<void> {
  const lowered = email.trim().toLowerCase();
  const sameEmail = (column: AnyPgColumn) => sql`lower(${column}) = ${lowered}`;

  await tx
    .update(eventJudges)
    .set({ email: null })
    .where(rosterMatch({ id: userId, email }));
  await tx.delete(invite).where(sameEmail(invite.email));
  await tx.delete(magicLinkCooldown).where(sameEmail(magicLinkCooldown.email));

  // Better Auth stores a magic link as `{"email":…,"name":…}` and the
  // delete-account / password-reset tokens as the bare user id.
  const magicLinkValue = JSON.stringify({ email: lowered });
  await tx
    .delete(verification)
    .where(
      or(
        eq(verification.value, userId),
        sql`lower(${verification.value}) = ${magicLinkValue}`,
        sql`starts_with(lower(${verification.value}), ${magicLinkValue.slice(0, -1) + ','})`,
      ),
    );
}

/** Best effort, like the storage cleanup: Google being down must not block the erasure. */
async function revokeWalletPasses(userId: string): Promise<void> {
  try {
    // Passes are only issued for top-level events.
    const rows = await db
      .select({ eventId: eventParticipants.eventId })
      .from(eventParticipants)
      .innerJoin(events, eq(events.id, eventParticipants.eventId))
      .where(
        and(eq(eventParticipants.userId, userId), isNull(events.parentEventId)),
      );
    await revokeGoogleWalletPasses(
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
      .select({ resumeFile: userProfiles.resumeFile })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    const [row] = await db
      .select({ image: user.image })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const pictureKey = parseOwnedProfilePictureKey(row?.image, userId);
    await Promise.all([
      pictureKey ? deleteObject(pictureKey) : Promise.resolve(),
      profile?.resumeFile
        ? deleteObject(profile.resumeFile)
        : Promise.resolve(),
    ]);
  } catch (error) {
    console.error('[account-deletion] failed to delete user files', error);
  }
}
