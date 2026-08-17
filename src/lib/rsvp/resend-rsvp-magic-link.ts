import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import {
  eventRsvpResponses,
  eventRsvpWaves,
  rsvpStatuses,
  user,
} from '@/db/schema';
import { sendRsvpMagicLink } from '@/lib/rsvp/send-rsvp-magic-link';
import { isEffectivePendingRsvp } from '@/lib/rsvp/effective-rsvp-status';
import { db } from '@/utils/db';

const PENDING_RSVP_STATUS_LABEL = 'pending';

export type ResendRsvpMagicLinkSuccess = {
  success: true;
  eventId: string;
  userId: string;
  email: string;
  /** Existing pending response that was left unchanged. */
  responseId: string;
  waveId: string;
};

export type ResendRsvpMagicLinkFailure = {
  success: false;
  error: string;
};

export type ResendRsvpMagicLinkResult =
  | ResendRsvpMagicLinkSuccess
  | ResendRsvpMagicLinkFailure;

export type ResendRsvpMagicLinkOptions = {
  eventId: string;
  /** Prefer userId when available; email is used as a fallback lookup. */
  userId?: string;
  email?: string;
};

/**
 * Sends a fresh magic link for an existing pending RSVP (e.g. when the 24h
 * auth token expired before `respondBy`). Does not create a wave or response.
 */
export async function resendRsvpMagicLink(
  options: ResendRsvpMagicLinkOptions,
): Promise<ResendRsvpMagicLinkResult> {
  const eventId = options.eventId.trim();
  if (!eventId) {
    return { success: false, error: 'Event ID is required.' };
  }

  const userId = options.userId?.trim();
  const email = options.email?.trim().toLowerCase();
  if (!userId && !email) {
    return {
      success: false,
      error: 'A userId or email is required to resend an RSVP magic link.',
    };
  }

  const [pendingStatus] = await db
    .select({ id: rsvpStatuses.id })
    .from(rsvpStatuses)
    .where(eq(rsvpStatuses.label, PENDING_RSVP_STATUS_LABEL))
    .limit(1);

  if (!pendingStatus) {
    return {
      success: false,
      error: 'RSVP statuses are not configured (missing pending).',
    };
  }

  const whereClause = userId
    ? and(
        eq(eventRsvpWaves.eventId, eventId),
        eq(eventRsvpResponses.userId, userId),
        eq(eventRsvpResponses.statusId, pendingStatus.id),
      )
    : and(
        eq(eventRsvpWaves.eventId, eventId),
        eq(user.email, email!),
        eq(eventRsvpResponses.statusId, pendingStatus.id),
      );

  const [pending] = await db
    .select({
      responseId: eventRsvpResponses.id,
      waveId: eventRsvpWaves.id,
      userId: eventRsvpResponses.userId,
      email: user.email,
      respondBy: eventRsvpWaves.respondBy,
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .innerJoin(user, eq(eventRsvpResponses.userId, user.id))
    .where(whereClause)
    .orderBy(desc(eventRsvpWaves.wave))
    .limit(1);

  if (
    !pending ||
    !isEffectivePendingRsvp(PENDING_RSVP_STATUS_LABEL, pending.respondBy)
  ) {
    return {
      success: false,
      error: 'No pending RSVP response found for this user and event.',
    };
  }

  try {
    await sendRsvpMagicLink({
      email: pending.email,
      eventId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown magic-link error';
    console.error(
      `[resendRsvpMagicLink] failed for user ${pending.userId}:`,
      error,
    );
    return { success: false, error: message };
  }

  return {
    success: true,
    eventId,
    userId: pending.userId,
    email: pending.email,
    responseId: pending.responseId,
    waveId: pending.waveId,
  };
}
