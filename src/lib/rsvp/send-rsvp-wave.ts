import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import {
  events,
  eventApplications,
  applicationStatuses,
  eventRsvpWaves,
  eventRsvpResponses,
  rsvpStatuses,
  user,
} from '@/db/schema';
import { auth } from '@/utils/auth';
import { db } from '@/utils/db';

/** DB label in application_statuses for an accepted application (UI title is "Accepted"). */
const APPROVED_APPLICATION_STATUS_LABEL = 'approved';

const PENDING_RSVP_STATUS_LABEL = 'pending';

export type RsvpWaveRecord = {
  id: string;
  eventId: string;
  wave: number;
  respondBy: Date;
  createdAt: Date;
};

export type RsvpWaveEmailFailure = {
  userId: string;
  email: string;
  error: string;
};

export type SendRsvpWaveSuccess = {
  success: true;
  wave: RsvpWaveRecord;
  eligibleApplicantCount: number;
  responsesCreated: number;
  emailsSent: number;
  emailFailures: RsvpWaveEmailFailure[];
};

export type SendRsvpWaveFailure = {
  success: false;
  error: string;
};

export type SendRsvpWaveResult = SendRsvpWaveSuccess | SendRsvpWaveFailure;

type EligibleApplicant = {
  userId: string;
  email: string;
};

/**
 * Headers for Better Auth server API calls outside a browser request
 * (CLI script, future cron). Uses BETTER_AUTH_URL as Origin — the same
 * trusted origin already configured for the app. Does not call Next.js
 * `headers()` so this works without an incoming HTTP request.
 */
function getBackgroundAuthHeaders(): Headers {
  const baseUrl = process.env.BETTER_AUTH_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      'BETTER_AUTH_URL is required to send RSVP magic-link invitations',
    );
  }
  return new Headers({
    origin: baseUrl,
  });
}

function eventCallbackPath(eventId: string): string {
  return `/dashboard/events/${eventId}?source=rsvp`;
}

/**
 * Creates the next RSVP wave for an event, inserts pending RSVP responses for
 * all approved applicants, and emails each a Better Auth magic link (same
 * pattern as admin `inviteUser`) that signs them in and redirects to the event
 * page. RSVP status stays pending until they Accept/Decline.
 *
 * Intended to be called by the future admin "start RSVP" action and cron-driven
 * follow-up waves.
 */
export async function sendRsvpWave(
  eventId: string,
  respondBy: Date,
): Promise<SendRsvpWaveResult> {
  const [eventRow] = await db
    .select({ id: events.id, name: events.name })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!eventRow) {
    return { success: false, error: 'Event not found.' };
  }

  const [[approvedStatus], [pendingRsvpStatus]] = await Promise.all([
    db
      .select({ id: applicationStatuses.id })
      .from(applicationStatuses)
      .where(eq(applicationStatuses.label, APPROVED_APPLICATION_STATUS_LABEL))
      .limit(1),
    db
      .select({ id: rsvpStatuses.id })
      .from(rsvpStatuses)
      .where(eq(rsvpStatuses.label, PENDING_RSVP_STATUS_LABEL))
      .limit(1),
  ]);

  if (!approvedStatus) {
    return {
      success: false,
      error: 'Application statuses are not configured (missing approved).',
    };
  }

  if (!pendingRsvpStatus) {
    return {
      success: false,
      error: 'RSVP statuses are not configured (missing pending).',
    };
  }

  const eligibleApplicants: EligibleApplicant[] = await db
    .select({
      userId: eventApplications.userId,
      email: user.email,
    })
    .from(eventApplications)
    .innerJoin(
      applicationStatuses,
      eq(eventApplications.statusId, applicationStatuses.id),
    )
    .innerJoin(user, eq(eventApplications.userId, user.id))
    .where(
      and(
        eq(eventApplications.eventId, eventId),
        eq(applicationStatuses.label, APPROVED_APPLICATION_STATUS_LABEL),
      ),
    );

  const [latestWave] = await db
    .select({ wave: eventRsvpWaves.wave })
    .from(eventRsvpWaves)
    .where(eq(eventRsvpWaves.eventId, eventId))
    .orderBy(desc(eventRsvpWaves.wave))
    .limit(1);

  const nextWaveNumber = (latestWave?.wave ?? 0) + 1;

  let waveRecord: RsvpWaveRecord;
  let invitedApplicants: EligibleApplicant[];

  try {
    const created = await db.transaction(async (tx) => {
      const [wave] = await tx
        .insert(eventRsvpWaves)
        .values({
          eventId,
          wave: nextWaveNumber,
          respondBy,
        })
        .returning({
          id: eventRsvpWaves.id,
          eventId: eventRsvpWaves.eventId,
          wave: eventRsvpWaves.wave,
          respondBy: eventRsvpWaves.respondBy,
          createdAt: eventRsvpWaves.createdAt,
        });

      if (eligibleApplicants.length === 0) {
        return {
          wave,
          responsesCreated: 0,
          invitedApplicants: [] as EligibleApplicant[],
        };
      }

      const insertedResponses = await tx
        .insert(eventRsvpResponses)
        .values(
          eligibleApplicants.map((applicant) => ({
            rsvpWaveId: wave.id,
            userId: applicant.userId,
            statusId: pendingRsvpStatus.id,
          })),
        )
        .returning({ userId: eventRsvpResponses.userId });

      const invitedUserIds = new Set(
        insertedResponses.map((response) => response.userId),
      );

      return {
        wave,
        responsesCreated: insertedResponses.length,
        invitedApplicants: eligibleApplicants.filter((applicant) =>
          invitedUserIds.has(applicant.userId),
        ),
      };
    });

    if (!created.wave.respondBy) {
      return {
        success: false,
        error: 'RSVP wave was created without a respond-by deadline.',
      };
    }

    waveRecord = {
      id: created.wave.id,
      eventId: created.wave.eventId,
      wave: created.wave.wave,
      respondBy: created.wave.respondBy,
      createdAt: created.wave.createdAt,
    };
    invitedApplicants = created.invitedApplicants;
  } catch (error) {
    console.error('[sendRsvpWave] database error:', error);
    return {
      success: false,
      error: 'Failed to create RSVP wave and responses.',
    };
  }

  const callbackURL = eventCallbackPath(eventId);
  const emailFailures: RsvpWaveEmailFailure[] = [];
  let emailsSent = 0;

  let authHeaders: Headers;
  try {
    authHeaders = getBackgroundAuthHeaders();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Missing BETTER_AUTH_URL';
    for (const applicant of invitedApplicants) {
      emailFailures.push({
        userId: applicant.userId,
        email: applicant.email,
        error: message,
      });
    }
    return {
      success: true,
      wave: waveRecord,
      eligibleApplicantCount: eligibleApplicants.length,
      responsesCreated: invitedApplicants.length,
      emailsSent: 0,
      emailFailures,
    };
  }

  for (const applicant of invitedApplicants) {
    try {
      // Same pattern as admin inviteUser: Better Auth generates the token and
      // calls sendMagicLink. RSVP-specific copy is chosen there when the
      // callbackURL is an event page and a pending RSVP exists.
      await auth.api.signInMagicLink({
        body: {
          email: applicant.email,
          callbackURL,
          errorCallbackURL: callbackURL,
        },
        headers: authHeaders,
      });
      emailsSent += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown magic-link error';
      console.error(
        `[sendRsvpWave] magic link failed for user ${applicant.userId}:`,
        error,
      );
      emailFailures.push({
        userId: applicant.userId,
        email: applicant.email,
        error: message,
      });
    }
  }

  return {
    success: true,
    wave: waveRecord,
    eligibleApplicantCount: eligibleApplicants.length,
    responsesCreated: invitedApplicants.length,
    emailsSent,
    emailFailures,
  };
}
