import { and, desc, eq } from 'drizzle-orm';

import {
  events,
  eventRsvpResponses,
  eventRsvpWaves,
  rsvpStatuses,
  user,
} from '@/db/schema';
import { buildRsvpInvitationEmail } from '@/lib/rsvp/rsvp-invitation-email';
import { db } from '@/utils/db';
import type { SendMailOptions } from '@/utils/mail';

const PENDING_RSVP_STATUS_LABEL = 'pending';

const EVENT_DASHBOARD_PATH =
  /^\/dashboard\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export type PendingRsvpInvitation = {
  eventName: string;
  respondBy: Date;
};

/**
 * Validates an RSVP callback path and returns the event UUID, or null when
 * the path is not exactly `/dashboard/events/{uuid}`.
 */
export function extractEventIdFromRsvpCallback(
  callbackURL: string,
): string | null {
  const [pathPart] = callbackURL.split('?', 2);
  if (!pathPart) return null;

  const match = EVENT_DASHBOARD_PATH.exec(pathPart);
  return match?.[1] ?? null;
}

/**
 * Confirms the recipient has a pending RSVP for the event and returns
 * invitation details for the latest matching wave.
 */
export async function findPendingRsvpInvitation(
  email: string,
  eventId: string,
): Promise<PendingRsvpInvitation | null> {
  const [row] = await db
    .select({
      eventName: events.name,
      respondBy: eventRsvpWaves.respondBy,
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .innerJoin(events, eq(eventRsvpWaves.eventId, events.id))
    .innerJoin(user, eq(eventRsvpResponses.userId, user.id))
    .innerJoin(
      rsvpStatuses,
      eq(eventRsvpResponses.statusId, rsvpStatuses.id),
    )
    .where(
      and(
        eq(user.email, email),
        eq(events.id, eventId),
        eq(rsvpStatuses.label, PENDING_RSVP_STATUS_LABEL),
      ),
    )
    .orderBy(desc(eventRsvpWaves.wave))
    .limit(1);

  if (!row?.respondBy) return null;

  return {
    eventName: row.eventName,
    respondBy: row.respondBy,
  };
}

/**
 * Builds RSVP invitation mail options for an explicitly marked RSVP magic link.
 *
 * Called only when `source=rsvp` was already confirmed by the auth router.
 * Invalid paths or missing pending RSVP responses throw so the invitation is
 * counted as an email failure instead of falling back to generic sign-in copy.
 */
export async function resolveRsvpMagicLinkMailOptions(options: {
  email: string;
  magicLinkUrl: string;
  callbackURL: string;
}): Promise<SendMailOptions> {
  const { email, magicLinkUrl, callbackURL } = options;

  const eventId = extractEventIdFromRsvpCallback(callbackURL);
  if (!eventId) {
    console.error(
      '[auth] RSVP magic link has an invalid event callback path',
    );
    throw new Error(
      'RSVP magic link callback path is invalid.',
    );
  }

  const invitation = await findPendingRsvpInvitation(email, eventId);
  if (!invitation) {
    console.error(
      '[auth] RSVP magic link requested but no pending RSVP response found',
      { eventId },
    );
    throw new Error(
      'RSVP magic link requested without a pending RSVP response.',
    );
  }

  const content = buildRsvpInvitationEmail({
    eventName: invitation.eventName,
    respondBy: invitation.respondBy,
    magicLinkUrl,
  });

  return {
    to: email,
    ...content,
  };
}
