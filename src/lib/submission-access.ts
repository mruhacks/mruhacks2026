import 'server-only';

import { and, eq, exists, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import * as Participation from '@/lib/participation';
import { getSubmissionWindow, type SubmissionWindow } from '@/lib/submissions';
import type { Queryable } from '@/lib/team-membership';
import { db } from '@/utils/db';

type SubmissionEvent = {
  id: string;
  hasApplication: boolean;
  teamsEnabled: boolean;
  checkInEnabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  submissionsCloseAt: Date | null;
};

export type SubmissionRow = typeof schema.submissions.$inferSelect;

export type SubmissionAccess = {
  event: SubmissionEvent;
  submissionWindow: SubmissionWindow;
  /**
   * Has reached the event's final positive state (`canSubmitProject`). Only
   * eligible members ever see, edit, publish or delete their team's project.
   */
  eligible: boolean;
  /** The caller's current team, or null if they have never had one. */
  teamId: string | null;
  /** The caller's team's submission, if it has one. */
  submission: SubmissionRow | null;
};

/**
 * Everything a submission action has to know about the caller before it
 * touches anything: the event's submission settings, where the window is,
 * whether the caller is eligible, and their team's submission. One place,
 * so the editor page and every action agree on who may do what.
 *
 * Pass a transaction handle to read the submission inside it (the caller is
 * expected to lock the row itself when it is about to write).
 */
export async function loadSubmissionAccess(
  userId: string,
  eventId: string,
  dbHandle: Queryable = db,
  now: Date = new Date(),
): Promise<SubmissionAccess | null> {
  const [event] = await dbHandle
    .select({
      id: schema.events.id,
      hasApplication: schema.events.hasApplication,
      teamsEnabled: schema.events.teamsEnabled,
      checkInEnabled: schema.events.checkInEnabled,
      startsAt: schema.events.startsAt,
      endsAt: schema.events.endsAt,
      submissionsCloseAt: schema.events.submissionsCloseAt,
      hasSentRsvpWave: sql<boolean>`${exists(
        dbHandle
          .select({ id: schema.eventRsvpWaves.id })
          .from(schema.eventRsvpWaves)
          .where(eq(schema.eventRsvpWaves.eventId, schema.events.id)),
      )}`,
    })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  if (!event) return null;

  const [[participant], [checkIn], [membership]] = await Promise.all([
    dbHandle
      .select({
        statusLabel: schema.participationStatuses.label,
        respondBy: schema.eventRsvpWaves.respondBy,
      })
      .from(schema.eventParticipants)
      .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
      .leftJoin(schema.eventInvitations, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
      .leftJoin(schema.eventRsvpWaves, eq(schema.eventInvitations.rsvpWaveId, schema.eventRsvpWaves.id))
      .where(and(eq(schema.eventParticipants.eventId, eventId), eq(schema.eventParticipants.userId, userId)))
      .limit(1),
    dbHandle
      .select({ userId: schema.checkIns.userId })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.eventId, eventId), eq(schema.checkIns.userId, userId)))
      .limit(1),
    dbHandle
      .select({ teamId: schema.teamMembers.teamId })
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.eventId, eventId), eq(schema.teamMembers.userId, userId)))
      .limit(1),
  ]);

  const { hasSentRsvpWave, ...eventFields } = event;
  const eligible =
    participant != null &&
    Participation.canSubmitProject(
      { checkInEnabled: event.checkInEnabled, hasSentRsvpWave },
      Participation.resolveEffectiveStatus(participant.statusLabel, participant.respondBy, now),
      checkIn != null,
    );

  const teamId = membership?.teamId ?? null;
  const [submission] = teamId
    ? await dbHandle.select().from(schema.submissions).where(eq(schema.submissions.teamId, teamId)).limit(1)
    : [];

  return {
    event: eventFields,
    submissionWindow: getSubmissionWindow(eventFields, now),
    eligible,
    teamId,
    submission: submission ?? null,
  };
}
