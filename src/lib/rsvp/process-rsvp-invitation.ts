import 'server-only';

import { and, eq, ne, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import * as Participation from '@/lib/participation';
import { sendRsvpMagicLink } from './send-rsvp-magic-link';
import { db } from '@/utils/db';

/** Delivery attempts after which a failing invitation is marked 'failed' instead of retried. */
const MAX_INVITATION_DELIVERY_ATTEMPTS = 8;

export type ProcessRsvpInvitationOutcome = 'sent' | 'already_sent' | 'not_found' | 'not_pending' | 'given_up';

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
      invitationEmailStatus: schema.eventInvitations.invitationEmailStatus,
      statusLabel: schema.participationStatuses.label,
      respondBy: schema.eventRsvpWaves.respondBy,
      eventId: schema.eventRsvpWaves.eventId,
      eventName: schema.events.name,
      email: schema.user.email,
    })
    .from(schema.eventInvitations)
    .innerJoin(schema.eventRsvpWaves, eq(schema.eventInvitations.rsvpWaveId, schema.eventRsvpWaves.id))
    .innerJoin(schema.events, eq(schema.eventRsvpWaves.eventId, schema.events.id))
    .innerJoin(schema.eventParticipants, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
    .innerJoin(schema.participationStatuses, eq(schema.eventParticipants.statusId, schema.participationStatuses.id))
    .innerJoin(schema.user, eq(schema.eventParticipants.userId, schema.user.id))
    .where(eq(schema.eventInvitations.id, responseId))
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

  if (Participation.resolveEffectiveStatus(row.statusLabel, row.respondBy) !== 'invited') {
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
    const message = error instanceof Error ? error.message : 'Unknown invitation email error';

    await db
      .update(schema.eventInvitations)
      .set({
        invitationEmailAttempts: sql`${schema.eventInvitations.invitationEmailAttempts} + 1`,
        invitationEmailLastError: message,
      })
      .where(eq(schema.eventInvitations.id, responseId));

    if (deliveryCount >= MAX_INVITATION_DELIVERY_ATTEMPTS) {
      // Guard against a stale write if a concurrent delivery already sent it.
      await db
        .update(schema.eventInvitations)
        .set({ invitationEmailStatus: 'failed' })
        .where(
          and(eq(schema.eventInvitations.id, responseId), ne(schema.eventInvitations.invitationEmailStatus, 'sent')),
        );
      console.error('[rsvp/process-invitation] giving up after max delivery attempts', {
        responseId,
        deliveryCount,
        error,
      });
      return 'given_up';
    }

    throw error;
  }

  await db
    .update(schema.eventInvitations)
    .set({
      invitationEmailStatus: 'sent',
      invitationEmailSentAt: new Date(),
      invitationEmailLastError: null,
    })
    .where(and(eq(schema.eventInvitations.id, responseId), ne(schema.eventInvitations.invitationEmailStatus, 'sent')));

  return 'sent';
}
