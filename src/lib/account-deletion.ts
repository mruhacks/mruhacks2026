import 'server-only';

import { and, asc, eq, ne } from 'drizzle-orm';

import {
  submissions,
  teamMembers,
  teams,
  user,
  userProfiles,
} from '@/db/schema';
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
 * - Teams they organize pass to the earliest-joined remaining member, the
 *   same rule as leaving a team. (`organizerId` is `set null` only as the
 *   backstop for a team left empty.)
 * - A team they were the last member of is dissolved — unless it holds a
 *   submission, in which case it stays, empty, to keep the project.
 * - Their objects outside the database (profile picture, resume).
 */
export async function prepareUserDeletion(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
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

  await deleteUserObjects(userId);
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
