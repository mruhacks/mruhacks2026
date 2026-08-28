/**
 * Server actions for the participant-facing Team panel at
 * dashboard/events/:id (view roster, invite, join, leave, remove member).
 *
 * Every user always has a real `teams` row per event — a "team-of-one" is a
 * normal team, lazily created on first access, not a special-cased null
 * state. This keeps codes and invite links symmetric whether or not anyone
 * else has joined yet.
 */

'use server';

import { and, asc, count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/utils/db';
import { getUser } from '@/utils/auth';
import { ActionResult, fail, ok } from '@/utils/action-result';
import { hasPermission } from '@/lib/rbac/authorization';
import { writeAuditLog } from '@/utils/audit-log';
import { generateTeamCode } from '@/lib/team-code';
import { joinTeamSchema } from './team-schemas';
import {
  events,
  eventAttendees,
  eventApplications,
  applicationStatuses,
  teams,
  teamMembers,
  user as authUser,
} from '@/db/schema';

/** Anything with the query methods used below: `db` itself, or a `db.transaction` handle. */
type Queryable = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

// ── Internal helpers ────────────────────────────────────────────────────

async function getEventTeamSettings(
  eventId: string,
): Promise<{ teamsEnabled: boolean; maxTeamSize: number | null } | null> {
  const [row] = await db
    .select({
      teamsEnabled: events.teamsEnabled,
      maxTeamSize: events.maxTeamSize,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  return row ?? null;
}

/**
 * Registered via simple signup, or has a live (non-denied) application.
 * Teams can be formed before a final decision is made — a pending or
 * waitlisted applicant should still be able to plan a team.
 */
async function isEventParticipant(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const [attendee] = await db
    .select({ userId: eventAttendees.userId })
    .from(eventAttendees)
    .where(
      and(
        eq(eventAttendees.eventId, eventId),
        eq(eventAttendees.userId, userId),
      ),
    )
    .limit(1);
  if (attendee) return true;

  const [application] = await db
    .select({ statusLabel: applicationStatuses.label })
    .from(eventApplications)
    .leftJoin(
      applicationStatuses,
      eq(eventApplications.statusId, applicationStatuses.id),
    )
    .where(
      and(
        eq(eventApplications.eventId, eventId),
        eq(eventApplications.userId, userId),
      ),
    )
    .limit(1);
  return application != null && application.statusLabel !== 'denied';
}

/** Loads (or lazily creates) the caller's current team-of-one/team for this event. */
async function getOrCreatePersonalTeam(
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

/**
 * Transactional wrapper around `getOrCreatePersonalTeam` for callers that
 * aren't already inside a transaction. Without one, the SELECT -> INSERT
 * teams -> INSERT team_members sequence can fail halfway and strand a
 * member-less `teams` row holding a live code. Two concurrent first-time
 * requests for the same user also race: the loser trips the
 * (user_id, event_id) unique index, so it rolls back and re-reads the row
 * the winner just created instead of surfacing a 23505.
 */
async function ensurePersonalTeam(
  userId: string,
  eventId: string,
): Promise<{ teamId: string } | null> {
  try {
    return await db.transaction((tx) =>
      getOrCreatePersonalTeam(userId, eventId, tx),
    );
  } catch (error) {
    const [existing] = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.userId, userId), eq(teamMembers.eventId, eventId)),
      )
      .limit(1);
    if (existing) return { teamId: existing.teamId };

    console.error('ensurePersonalTeam error:', error);
    return null;
  }
}

/**
 * Cleans up the team a user just left/was removed from: dissolves it if
 * empty, and reassigns Organizer status to the earliest-joined remaining
 * member if the departing user was the organizer. A no-op when the
 * departing user wasn't the organizer, or when nobody else remains to
 * reassign to (the sole remaining member already keeps their code/status
 * since `organizerId` is untouched in that case).
 */
async function cleanUpOldTeam(
  dbHandle: Queryable,
  oldTeamId: string,
  departingUserId: string,
): Promise<void> {
  const remaining = await dbHandle
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, oldTeamId))
    .orderBy(asc(teamMembers.joinedAt));

  if (remaining.length === 0) {
    await dbHandle.delete(teams).where(eq(teams.id, oldTeamId));
    return;
  }

  const [oldTeamRow] = await dbHandle
    .select({ organizerId: teams.organizerId })
    .from(teams)
    .where(eq(teams.id, oldTeamId))
    .limit(1);

  if (oldTeamRow?.organizerId === departingUserId) {
    await dbHandle
      .update(teams)
      .set({ organizerId: remaining[0]!.userId })
      .where(eq(teams.id, oldTeamId));
  }
}

// ── Public actions ──────────────────────────────────────────────────────

export type TeamMemberView = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  isOrganizer: boolean;
  joinedAt: Date;
};

export type TeamView = {
  teamId: string;
  code: string;
  organizerId: string;
  maxTeamSize: number | null;
  members: TeamMemberView[];
};

/** Story 5: view the caller's team roster for an event. */
export async function getMyTeam(
  eventId: string,
): Promise<ActionResult<TeamView>> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const settings = await getEventTeamSettings(eventId);
  if (!settings) return fail('Event not found.');
  if (!settings.teamsEnabled)
    return fail('Teams are not enabled for this event.');

  if (!(await isEventParticipant(currentUser.id, eventId))) {
    return fail('You must be registered for this event to manage a team.');
  }

  const personalTeam = await ensurePersonalTeam(currentUser.id, eventId);
  if (!personalTeam) return fail('Failed to load your team.');
  const { teamId } = personalTeam;

  try {
    const [teamRow] = await db
      .select({ code: teams.code, organizerId: teams.organizerId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!teamRow) return fail('Team not found.');

    const memberRows = await db
      .select({
        userId: teamMembers.userId,
        name: authUser.name,
        email: authUser.email,
        image: authUser.image,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .innerJoin(authUser, eq(teamMembers.userId, authUser.id))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(asc(teamMembers.joinedAt));

    return ok({
      teamId,
      code: teamRow.code,
      organizerId: teamRow.organizerId,
      maxTeamSize: settings.maxTeamSize,
      members: memberRows.map((m) => ({
        ...m,
        isOrganizer: m.userId === teamRow.organizerId,
      })),
    });
  } catch (error) {
    console.error('getMyTeam error:', error);
    return fail('Failed to load your team.');
  }
}

/** Story 3: leave the current team (if any) and join another by its code. */
export async function joinTeamByCode(
  eventId: string,
  code: string,
): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const parsed = joinTeamSchema.safeParse({ code });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid code.');
  }

  const settings = await getEventTeamSettings(eventId);
  if (!settings) return fail('Event not found.');
  if (!settings.teamsEnabled)
    return fail('Teams are not enabled for this event.');

  if (!(await isEventParticipant(currentUser.id, eventId))) {
    return fail('You must be registered for this event to manage a team.');
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Locked for the rest of the transaction: the size check below is a
      // read-then-write, and without this two simultaneous joins both read
      // the pre-join count and both pass, overflowing maxTeamSize.
      const [targetTeam] = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(
          and(eq(teams.eventId, eventId), eq(teams.code, parsed.data.code)),
        )
        .limit(1)
        .for('update');
      if (!targetTeam) return fail('Invalid team code.');

      const { teamId: currentTeamId } = await getOrCreatePersonalTeam(
        currentUser.id,
        eventId,
        tx,
      );

      // Re-entering your own team's code is a no-op, not an error.
      if (currentTeamId === targetTeam.id) {
        return ok('You are already on this team.');
      }

      const [{ total: targetCount }] = await tx
        .select({ total: count() })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, targetTeam.id));

      if (settings.maxTeamSize != null && targetCount >= settings.maxTeamSize) {
        return fail('This team is full.');
      }

      await tx
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, currentUser.id),
            eq(teamMembers.eventId, eventId),
          ),
        );
      await tx
        .insert(teamMembers)
        .values({ teamId: targetTeam.id, userId: currentUser.id, eventId });

      await cleanUpOldTeam(tx, currentTeamId, currentUser.id);

      return ok('Joined team.');
    });

    if (result.success) revalidatePath(`/dashboard/events/${eventId}`);
    return result;
  } catch (error) {
    console.error('joinTeamByCode error:', error);
    return fail('Failed to join team.');
  }
}

/** Story 4: leave the current team, reverting to a fresh personal team-of-one. */
export async function leaveTeam(eventId: string): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  const settings = await getEventTeamSettings(eventId);
  if (!settings) return fail('Event not found.');
  if (!settings.teamsEnabled)
    return fail('Teams are not enabled for this event.');

  if (!(await isEventParticipant(currentUser.id, eventId))) {
    return fail('You must be registered for this event to manage a team.');
  }

  try {
    const result = await db.transaction(async (tx) => {
      const { teamId: currentTeamId } = await getOrCreatePersonalTeam(
        currentUser.id,
        eventId,
        tx,
      );

      const [{ total: memberCount }] = await tx
        .select({ total: count() })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, currentTeamId));

      if (memberCount <= 1) {
        return ok('You are already on your own team.');
      }

      await tx
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, currentUser.id),
            eq(teamMembers.eventId, eventId),
          ),
        );

      const newCode = await generateTeamCode(eventId, tx);
      const [newTeam] = await tx
        .insert(teams)
        .values({ eventId, organizerId: currentUser.id, code: newCode })
        .returning({ id: teams.id });
      await tx
        .insert(teamMembers)
        .values({ teamId: newTeam!.id, userId: currentUser.id, eventId });

      await cleanUpOldTeam(tx, currentTeamId, currentUser.id);

      return ok('Left team.');
    });

    if (result.success) revalidatePath(`/dashboard/events/${eventId}`);
    return result;
  } catch (error) {
    console.error('leaveTeam error:', error);
    return fail('Failed to leave team.');
  }
}

/**
 * Story 2: remove another member from a team. Allowed for that team's
 * Organizer (self-service), or for anyone holding `team:manage:all`
 * (platform moderation override, audit-logged).
 */
export async function removeMember(
  eventId: string,
  targetUserId: string,
): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('Not authenticated');

  if (targetUserId === currentUser.id) {
    return fail('Use "Leave team" to remove yourself.');
  }

  const settings = await getEventTeamSettings(eventId);
  if (!settings) return fail('Event not found.');
  if (!settings.teamsEnabled)
    return fail('Teams are not enabled for this event.');

  const [targetMembership] = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, targetUserId),
        eq(teamMembers.eventId, eventId),
      ),
    )
    .limit(1);
  if (!targetMembership) {
    return fail('That user is not part of a team for this event.');
  }

  const [targetTeam] = await db
    .select({ organizerId: teams.organizerId })
    .from(teams)
    .where(eq(teams.id, targetMembership.teamId))
    .limit(1);
  if (!targetTeam) return fail('Team not found.');

  // A denied applicant (or someone who unregistered) keeps their
  // `teams.organizerId` even though the Team panel is gone from their UI, so
  // the participant check has to be part of the self-service grant — not
  // just a precondition of the page that renders the button. Moderators
  // acting under `team:manage:all` are deliberately exempt.
  const isSelfServiceOrganizer =
    targetTeam.organizerId === currentUser.id &&
    targetTeam.organizerId !== targetUserId &&
    (await isEventParticipant(currentUser.id, eventId));

  let isAdminOverride = false;
  if (!isSelfServiceOrganizer) {
    isAdminOverride = await hasPermission(currentUser.id, 'team:manage:all');
    if (!isAdminOverride) return fail('Not authorized to remove this member.');
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, targetUserId),
            eq(teamMembers.eventId, eventId),
          ),
        );

      const newCode = await generateTeamCode(eventId, tx);
      const [newTeam] = await tx
        .insert(teams)
        .values({ eventId, organizerId: targetUserId, code: newCode })
        .returning({ id: teams.id });
      await tx
        .insert(teamMembers)
        .values({ teamId: newTeam!.id, userId: targetUserId, eventId });

      await cleanUpOldTeam(tx, targetMembership.teamId, targetUserId);

      return ok('Member removed.');
    });

    if (result.success) {
      revalidatePath(`/dashboard/events/${eventId}`);
      if (isAdminOverride) {
        await writeAuditLog({
          actorId: currentUser.id,
          action: 'team.member.removed',
          targetType: 'team_member',
          targetId: targetUserId,
          metadata: { eventId, teamId: targetMembership.teamId },
        });
      }
    }
    return result;
  } catch (error) {
    console.error('removeMember error:', error);
    return fail('Failed to remove member.');
  }
}
