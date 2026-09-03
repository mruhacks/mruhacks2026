import 'server-only';

import { and, eq, ne, sql } from 'drizzle-orm';

import {
  events,
  eventRsvpResponses,
  eventRsvpWaves,
  rsvpStatuses,
  user,
} from '@/db/schema';
import { isEffectivePendingRsvp } from '@/lib/rsvp/effective-rsvp-status';
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
      invitationEmailStatus: eventRsvpResponses.invitationEmailStatus,
      statusLabel: rsvpStatuses.label,
      respondBy: eventRsvpWaves.respondBy,
      eventId: eventRsvpWaves.eventId,
      eventName: events.name,
      email: user.email,
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .innerJoin(events, eq(eventRsvpWaves.eventId, events.id))
    .innerJoin(user, eq(eventRsvpResponses.userId, user.id))
    .leftJoin(rsvpStatuses, eq(eventRsvpResponses.statusId, rsvpStatuses.id))
    .where(eq(eventRsvpResponses.id, responseId))
    .limit(1);

  if (!row) {
    console.warn('[processRsvpInvitation] response not found', {
      responseId,
    });
    return 'not_found';
  }

  if (row.invitationEmailStatus === 'sent') {
    return 'already_sent';
  }

  if (
    !row.respondBy ||
    !isEffectivePendingRsvp(row.statusLabel, row.respondBy)
  ) {
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
      .update(eventRsvpResponses)
      .set({
        invitationEmailAttempts: sql`${eventRsvpResponses.invitationEmailAttempts} + 1`,
        invitationEmailLastError: message,
      })
      .where(eq(eventRsvpResponses.id, responseId));

    if (deliveryCount >= MAX_INVITATION_DELIVERY_ATTEMPTS) {
      // Guard against a stale write if a concurrent delivery already sent it.
      await db
        .update(eventRsvpResponses)
        .set({ invitationEmailStatus: 'failed' })
        .where(
          and(
            eq(eventRsvpResponses.id, responseId),
            ne(eventRsvpResponses.invitationEmailStatus, 'sent'),
          ),
        );
      console.error(
        '[processRsvpInvitation] giving up after max delivery attempts',
        { responseId, deliveryCount, error },
      );
      return 'given_up';
    }

    throw error;
  }

  await db
    .update(eventRsvpResponses)
    .set({
      invitationEmailStatus: 'sent',
      invitationEmailSentAt: new Date(),
      invitationEmailLastError: null,
    })
    .where(
      and(
        eq(eventRsvpResponses.id, responseId),
        ne(eventRsvpResponses.invitationEmailStatus, 'sent'),
      ),
    );

  return 'sent';
}
