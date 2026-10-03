import { and, count, eq } from 'drizzle-orm';

import {
  eventInvitations,
  eventParticipants,
  participationStatuses,
} from '@/db/schema';
import type { ParticipationStatus } from '@/types/lookups';
import { db } from '@/utils/db';

/**
 * Shared fixtures for participation tests. `participation_statuses` is seeded
 * by the migration, so tests only ever look ids up — never insert them.
 */

export async function statusId(label: ParticipationStatus): Promise<number> {
  const [row] = await db
    .select({ id: participationStatuses.id })
    .from(participationStatuses)
    .where(eq(participationStatuses.label, label))
    .limit(1);
  if (!row) throw new Error(`participation status ${label} is not seeded`);
  return row.id;
}

export async function insertParticipant(input: {
  eventId: string;
  userId: string;
  status: ParticipationStatus;
  createdAt?: Date;
  waitlistPosition?: number | null;
  responses?: Record<string, unknown> | null;
}): Promise<string> {
  const [row] = await db
    .insert(eventParticipants)
    .values({
      eventId: input.eventId,
      userId: input.userId,
      statusId: await statusId(input.status),
      waitlistPosition: input.waitlistPosition ?? null,
      responses: input.responses === undefined ? {} : input.responses,
      ...(input.createdAt
        ? { createdAt: input.createdAt, updatedAt: input.createdAt }
        : {}),
    })
    .returning({ id: eventParticipants.id });
  return row.id;
}

/**
 * Invites a participant in `rsvpWaveId` and moves them to `status` (default
 * `invited`) — creating the participant first when only (event, user) is
 * given.
 */
export async function insertInvitation(input: {
  rsvpWaveId: string;
  status?: Extract<
    ParticipationStatus,
    'invited' | 'accepted' | 'declined' | 'timed_out'
  >;
  participantId?: string;
  eventId?: string;
  userId?: string;
  respondedAt?: Date | null;
  termsAcceptedAt?: Date | null;
  acceptedTermsId?: string | null;
  invitationEmailStatus?: string;
  invitationEmailAttempts?: number;
  createdAt?: Date;
}): Promise<{ participantId: string; invitationId: string }> {
  const status = input.status ?? 'invited';
  let participantId = input.participantId;
  if (!participantId) {
    if (!input.eventId || !input.userId) {
      throw new Error('insertInvitation needs participantId or eventId+userId');
    }
    const [existing] = await db
      .select({ id: eventParticipants.id })
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, input.eventId),
          eq(eventParticipants.userId, input.userId),
        ),
      )
      .limit(1);
    participantId =
      existing?.id ??
      (await insertParticipant({
        eventId: input.eventId,
        userId: input.userId,
        status,
      }));
  }

  await db
    .update(eventParticipants)
    .set({ statusId: await statusId(status) })
    .where(eq(eventParticipants.id, participantId));

  const [invitation] = await db
    .insert(eventInvitations)
    .values({
      rsvpWaveId: input.rsvpWaveId,
      participantId,
      respondedAt: input.respondedAt ?? null,
      termsAcceptedAt: input.termsAcceptedAt ?? null,
      acceptedTermsId: input.acceptedTermsId ?? null,
      ...(input.invitationEmailStatus
        ? { invitationEmailStatus: input.invitationEmailStatus }
        : {}),
      ...(input.invitationEmailAttempts !== undefined
        ? { invitationEmailAttempts: input.invitationEmailAttempts }
        : {}),
      ...(input.createdAt
        ? { createdAt: input.createdAt, updatedAt: input.createdAt }
        : {}),
    })
    .returning({ id: eventInvitations.id });
  return { participantId, invitationId: invitation.id };
}

/** Stored (not effective) status label for (event, user), or null. */
export async function getStatus(
  eventId: string,
  userId: string,
): Promise<ParticipationStatus | null> {
  const [row] = await db
    .select({ label: participationStatuses.label })
    .from(eventParticipants)
    .innerJoin(
      participationStatuses,
      eq(eventParticipants.statusId, participationStatuses.id),
    )
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.userId, userId),
      ),
    )
    .limit(1);
  return (row?.label as ParticipationStatus | undefined) ?? null;
}

export async function setStatus(
  eventId: string,
  userId: string,
  status: ParticipationStatus,
): Promise<void> {
  await db
    .update(eventParticipants)
    .set({ statusId: await statusId(status) })
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.userId, userId),
      ),
    );
}

/** Participants holding a spot for an event. */
export async function countAccepted(eventId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.statusId, await statusId('accepted')),
      ),
    );
  return Number(row?.c ?? 0);
}

/**
 * Participants holding a spot (`accepted`) — what an `event_attendees` row
 * used to mean. Conflicts are ignored, like the old attendee primary key.
 */
export async function insertAttendees(
  rows:
    | { eventId: string; userId: string; registeredAt?: Date }
    | { eventId: string; userId: string; registeredAt?: Date }[],
): Promise<void> {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) return;
  const accepted = await statusId('accepted');
  await db
    .insert(eventParticipants)
    .values(
      list.map((row) => ({
        eventId: row.eventId,
        userId: row.userId,
        statusId: accepted,
        responses: null,
        ...(row.registeredAt
          ? { createdAt: row.registeredAt, updatedAt: row.registeredAt }
          : {}),
      })),
    )
    .onConflictDoNothing();
}
