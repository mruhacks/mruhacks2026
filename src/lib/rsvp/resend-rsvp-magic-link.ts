import 'server-only';

import { and, eq, ne, sql } from 'drizzle-orm';

import {
  events,
  eventInvitations,
  eventParticipants,
  eventRsvpWaves,
  user,
} from '@/db/schema';
import { hasStatus } from '@/lib/participation/server';
import { resolveEffectiveStatus } from '@/lib/participation/status';
import { sendRsvpMagicLink } from '@/lib/rsvp/send-rsvp-magic-link';
import { db } from '@/utils/db';

export type ResendRsvpMagicLinkSuccess = {
  success: true;
  eventId: string;
  userId: string;
  email: string;
  /** Existing open invitation that was left unchanged. */
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
 * Sends a fresh magic link for an existing open invitation (participant
 * still `invited`). Token lifetime is remaining time until the wave
 * `respondBy`. Does not create a wave or invitation.
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

  const whereClause = and(
    eq(eventParticipants.eventId, eventId),
    userId ? eq(eventParticipants.userId, userId) : eq(user.email, email!),
    hasStatus('invited'),
  );

  const [pending] = await db
    .select({
      responseId: eventInvitations.id,
      waveId: eventRsvpWaves.id,
      userId: eventParticipants.userId,
      email: user.email,
      eventName: events.name,
      respondBy: eventRsvpWaves.respondBy,
    })
    .from(eventInvitations)
    .innerJoin(
      eventRsvpWaves,
      eq(eventInvitations.rsvpWaveId, eventRsvpWaves.id),
    )
    .innerJoin(
      eventParticipants,
      eq(eventInvitations.participantId, eventParticipants.id),
    )
    .innerJoin(events, eq(eventParticipants.eventId, events.id))
    .innerJoin(user, eq(eventParticipants.userId, user.id))
    .where(whereClause)
    .limit(1);

  if (
    !pending ||
    resolveEffectiveStatus('invited', pending.respondBy) !== 'invited'
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
      eventName: pending.eventName,
      respondBy: pending.respondBy,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown magic-link error';
    console.error('[rsvp/resend-magic-link] failed to send magic link', {
      userId: pending.userId,
      error,
    });
    // Guard against a stale write if a concurrent delivery already sent it.
    await db
      .update(eventInvitations)
      .set({
        invitationEmailStatus: 'failed',
        invitationEmailAttempts: sql`${eventInvitations.invitationEmailAttempts} + 1`,
        invitationEmailLastError: message,
      })
      .where(
        and(
          eq(eventInvitations.id, pending.responseId),
          ne(eventInvitations.invitationEmailStatus, 'sent'),
        ),
      );
    return { success: false, error: message };
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
        eq(eventInvitations.id, pending.responseId),
        ne(eventInvitations.invitationEmailStatus, 'sent'),
      ),
    );

  return {
    success: true,
    eventId,
    userId: pending.userId,
    email: pending.email,
    responseId: pending.responseId,
    waveId: pending.waveId,
  };
}
