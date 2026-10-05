import 'server-only';

import { and, eq } from 'drizzle-orm';

import { teamMembers, teams } from '@/db/schema';
import { generateTeamCode } from '@/lib/team-code';
import { db } from '@/utils/db';

/** Anything with the query methods used below: `db` itself, or a `db.transaction` handle. */
export type Queryable = Pick<
  typeof db,
  'select' | 'insert' | 'update' | 'delete'
>;

/** Loads (or lazily creates) the caller's current team-of-one/team for this event. */
export async function getOrCreatePersonalTeam(
  userId: string,
  eventId: string,
  dbHandle: Queryable = db,
): Promise<{ teamId: string }> {
  const [existing] = await dbHandle
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(
      and(eq(teamMembers.userId, userId), eq(teamMembers.eventId, eventId)),
    )
    .limit(1);
  if (existing) return { teamId: existing.teamId };

  const code = await generateTeamCode(eventId, dbHandle);
  const [newTeam] = await dbHandle
    .insert(teams)
    .values({ eventId, organizerId: userId, code })
    .returning({ id: teams.id });
  await dbHandle
    .insert(teamMembers)
    .values({ teamId: newTeam!.id, userId, eventId });
  return { teamId: newTeam!.id };
}
