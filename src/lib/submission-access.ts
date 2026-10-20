import 'server-only';

import { and, eq, exists, sql } from 'drizzle-orm';

import {
  checkIns,
  eventInvitations,
  eventParticipants,
  eventRsvpWaves,
  events,
  participationStatuses,
  submissions,
  teamMembers,
} from '@/db/schema';
import {
  canSubmitProject,
  resolveEffectiveStatus,
} from '@/lib/participation/status';
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

export type SubmissionRow = typeof submissions.$inferSelect;

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
      id: events.id,
      hasApplication: events.hasApplication,
      teamsEnabled: events.teamsEnabled,
      checkInEnabled: events.checkInEnabled,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      submissionsCloseAt: events.submissionsCloseAt,
      hasSentRsvpWave: sql<boolean>`${exists(
        dbHandle
          .select({ id: eventRsvpWaves.id })
          .from(eventRsvpWaves)
          .where(eq(eventRsvpWaves.eventId, events.id)),
      )}`,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return null;

  const [[participant], [checkIn], [membership]] = await Promise.all([
    dbHandle
      .select({
        statusLabel: participationStatuses.label,
        respondBy: eventRsvpWaves.respondBy,
      })
      .from(eventParticipants)
      .innerJoin(
        participationStatuses,
        eq(eventParticipants.statusId, participationStatuses.id),
      )
      .leftJoin(
        eventInvitations,
        eq(eventInvitations.participantId, eventParticipants.id),
      )
      .leftJoin(
        eventRsvpWaves,
        eq(eventInvitations.rsvpWaveId, eventRsvpWaves.id),
      )
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.userId, userId),
        ),
      )
      .limit(1),
    dbHandle
      .select({ userId: checkIns.userId })
      .from(checkIns)
      .where(and(eq(checkIns.eventId, eventId), eq(checkIns.userId, userId)))
      .limit(1),
    dbHandle
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, userId)),
      )
      .limit(1),
  ]);

  const { hasSentRsvpWave, ...eventFields } = event;
  const eligible =
    participant != null &&
    canSubmitProject(
      { checkInEnabled: event.checkInEnabled, hasSentRsvpWave },
      resolveEffectiveStatus(
        participant.statusLabel,
        participant.respondBy,
        now,
      ),
      checkIn != null,
    );

  const teamId = membership?.teamId ?? null;
  const [submission] = teamId
    ? await dbHandle
        .select()
        .from(submissions)
        .where(eq(submissions.teamId, teamId))
        .limit(1)
    : [];

  return {
    event: eventFields,
    submissionWindow: getSubmissionWindow(eventFields, now),
    eligible,
    teamId,
    submission: submission ?? null,
  };
}
