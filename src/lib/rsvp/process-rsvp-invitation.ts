import 'server-only';

import { and, eq, ne, sql } from 'drizzle-orm';
import { APIError } from 'better-auth';

import {
  events,
  eventInvitations,
  eventParticipants,
  eventRsvpWaves,
  participationStatuses,
  user,
} from '@/db/schema';
import { resolveEffectiveStatus } from '@/lib/participation/status';
import { sendRsvpMagicLink } from '@/lib/rsvp/send-rsvp-magic-link';
import { db } from '@/utils/db';

/** Delivery attempts after which a failing invitation is marked 'failed' instead of retried. */
export const MAX_INVITATION_DELIVERY_ATTEMPTS = 8;

export type ProcessRsvpInvitationOutcome =
  | 'sent'
  | 'already_sent'
  | 'not_found'
  | 'not_pending'
  | 'given_up';

/**
 * Queue-provider-agnostic consumer logic for one RSVP invitation message.
 * Returns normally (ack) for every outcome except a retryable send failure,
 * which it rethrows so the caller's queue redelivers the message.
 */
export async function processRsvpInvitation(
  responseId: string,
  deliveryCount: number,
): Promise<ProcessRsvpInvitationOutcome> {
  const [row] = await db
    .select({
      invitationEmailStatus: eventInvitations.invitationEmailStatus,
      statusLabel: participationStatuses.label,
      respondBy: eventRsvpWaves.respondBy,
      eventId: eventRsvpWaves.eventId,
      eventName: events.name,
      email: user.email,
    })
    .from(eventInvitations)
    .innerJoin(
      eventRsvpWaves,
      eq(eventInvitations.rsvpWaveId, eventRsvpWaves.id),
    )
    .innerJoin(events, eq(eventRsvpWaves.eventId, events.id))
    .innerJoin(
      eventParticipants,
      eq(eventInvitations.participantId, eventParticipants.id),
    )
    .innerJoin(
      participationStatuses,
      eq(eventParticipants.statusId, participationStatuses.id),
    )
    .innerJoin(user, eq(eventParticipants.userId, user.id))
    .where(eq(eventInvitations.id, responseId))
    .limit(1);

  if (!row) {
    console.warn('[rsvp/process-invitation] response not found', {
      responseId,
    });
    return 'not_found';
  }

  if (row.invitationEmailStatus === 'sent') {
    return 'already_sent';
  }

  if (resolveEffectiveStatus(row.statusLabel, row.respondBy) !== 'invited') {
    return 'not_pending';
  }

  try {
    await sendRsvpMagicLink({
      email: row.email,
      eventId: row.eventId,
      eventName: row.eventName,
      respondBy: row.respondBy,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown magic-link error';

    await db
      .update(eventInvitations)
      .set({
        invitationEmailAttempts: sql`${eventInvitations.invitationEmailAttempts} + 1`,
        invitationEmailLastError: message,
      })
      .where(eq(eventInvitations.id, responseId));

    // A validation error (e.g. malformed email) is never going to succeed on
    // redelivery — the request body doesn't change between attempts — so
    // give up immediately instead of burning through retries.
    const isPermanentFailure =
      error instanceof APIError && error.body?.code === 'VALIDATION_ERROR';

    if (
      isPermanentFailure ||
      deliveryCount >= MAX_INVITATION_DELIVERY_ATTEMPTS
    ) {
      // Guard against a stale write if a concurrent delivery already sent it.
      await db
        .update(eventInvitations)
        .set({ invitationEmailStatus: 'failed' })
        .where(
          and(
            eq(eventInvitations.id, responseId),
            ne(eventInvitations.invitationEmailStatus, 'sent'),
          ),
        );
      console.error(
        isPermanentFailure
          ? '[rsvp/process-invitation] giving up after non-retryable error'
          : '[rsvp/process-invitation] giving up after max delivery attempts',
        { responseId, deliveryCount, error },
      );
      return 'given_up';
    }

    throw error;
  }

  await db
    .update(eventInvitations)
    .set({
      invitationEmailStatus: 'sent',
      invitationEmailSentAt: new Date(),
      invitationEmailLastError: null,
    })
    .where(
      and(
        eq(eventInvitations.id, responseId),
        ne(eventInvitations.invitationEmailStatus, 'sent'),
      ),
    );

  return 'sent';
}
