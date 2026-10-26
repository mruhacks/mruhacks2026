import 'server-only';

import { desc, eq, inArray } from 'drizzle-orm';

import * as schema from '@/db/schema';
import * as Participation from '@/lib/participation';
import { isRsvpWaveActive } from './compute-rsvp-respond-by';
import { getEligibleRsvpApplicants } from './eligible-rsvp-applicants';
import { db } from '@/utils/db';

export type AdminRsvpLifecycle =
  | 'no_application'
  | 'no_waves'
  | 'active_wave'
  | 'awaiting_scheduled_wave'
  | 'event_full'
  | 'no_eligible_applicants'
  | 'event_started';

/** Invitation email delivery state, separate from the RSVP decision itself. */
export type InvitationEmailStatus = 'legacy' | 'unsent' | 'queued' | 'sent' | 'failed';

export type AdminRsvpParticipant = {
  responseId: string;
  userId: string;
  name: string;
  email: string;
  /** The participant's effective status — always an invitation outcome. */
  statusLabel: Participation.InvitationStatus;
  respondedAt: Date | null;
  termsAcceptedAt: Date | null;
  invitationEmailStatus: InvitationEmailStatus;
};

export type AdminRsvpWaveSummary = {
  id: string;
  wave: number;
  createdAt: Date;
  respondBy: Date;
  isActive: boolean;
  invitedCount: number;
  acceptedCount: number;
  declinedCount: number;
  timedOutCount: number;
  waitingCount: number;
  participants: AdminRsvpParticipant[];
};

export type AdminRsvpSummary = {
  eventId: string;
  hasApplication: boolean;
  capacity: number | null;
  attendeeCount: number;
  availableSpots: number | null;
  eligibleApplicantCount: number;
  eventHasStarted: boolean;
  lifecycle: AdminRsvpLifecycle;
  latestWave: AdminRsvpWaveSummary | null;
  previousWaves: AdminRsvpWaveSummary[];
};

const STATUS_SORT_ORDER: Record<Participation.InvitationStatus, number> = {
  invited: 0,
  accepted: 1,
  declined: 2,
  timed_out: 3,
};

export function deriveAdminRsvpLifecycle(input: {
  hasApplication: boolean;
  latestWave: { respondBy: Date } | null;
  isFull: boolean;
  eligibleApplicantCount: number;
  eventHasStarted: boolean;
  now: Date;
}): AdminRsvpLifecycle {
  if (!input.hasApplication) return 'no_application';
  if (!input.latestWave) return 'no_waves';
  if (isRsvpWaveActive(input.latestWave.respondBy, input.now)) {
    return 'active_wave';
  }
  if (input.eventHasStarted) return 'event_started';
  if (input.isFull) return 'event_full';
  if (input.eligibleApplicantCount === 0) return 'no_eligible_applicants';
  return 'awaiting_scheduled_wave';
}

function summarizeWave(options: {
  id: string;
  wave: number;
  createdAt: Date;
  respondBy: Date;
  now: Date;
  rows: {
    responseId: string;
    userId: string;
    name: string;
    email: string;
    storedLabel: string | null;
    respondedAt: Date | null;
    termsAcceptedAt: Date | null;
    invitationEmailStatus: string;
  }[];
}): AdminRsvpWaveSummary {
  const participants: AdminRsvpParticipant[] = options.rows.map((row) => {
    const status = Participation.resolveEffectiveStatus(row.storedLabel, options.respondBy, options.now);
    return {
      responseId: row.responseId,
      userId: row.userId,
      name: row.name,
      email: row.email,
      // An invitation always moves its participant to an invitation outcome;
      // anything else would be a hand-edited row, shown as still waiting.
      statusLabel: Participation.isInvitationStatus(status) ? status : 'invited',
      respondedAt: row.respondedAt,
      termsAcceptedAt: row.termsAcceptedAt,
      invitationEmailStatus: row.invitationEmailStatus as InvitationEmailStatus,
    };
  });

  participants.sort((a, b) => {
    const statusDiff = STATUS_SORT_ORDER[a.statusLabel] - STATUS_SORT_ORDER[b.statusLabel];
    if (statusDiff !== 0) return statusDiff;
    return a.name.localeCompare(b.name);
  });

  let acceptedCount = 0;
  let declinedCount = 0;
  let timedOutCount = 0;
  let waitingCount = 0;
  for (const participant of participants) {
    if (participant.statusLabel === 'accepted') acceptedCount += 1;
    else if (participant.statusLabel === 'declined') declinedCount += 1;
    else if (participant.statusLabel === 'timed_out') timedOutCount += 1;
    else waitingCount += 1;
  }

  return {
    id: options.id,
    wave: options.wave,
    createdAt: options.createdAt,
    respondBy: options.respondBy,
    isActive: isRsvpWaveActive(options.respondBy, options.now),
    invitedCount: participants.length,
    acceptedCount,
    declinedCount,
    timedOutCount,
    waitingCount,
    participants,
  };
}

/**
 * Read-only RSVP overview for an event, derived from its waves, invitations,
 * participant statuses and eligibility — no extra tables.
 */
export async function getAdminRsvpSummary(eventId: string, now: Date = new Date()): Promise<AdminRsvpSummary | null> {
  const [eventRow] = await db
    .select({
      id: schema.events.id,
      hasApplication: schema.events.hasApplication,
      startsAt: schema.events.startsAt,
    })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);

  if (!eventRow) return null;

  const eventHasStarted = Boolean(eventRow.startsAt && now.getTime() >= eventRow.startsAt.getTime());

  if (!eventRow.hasApplication) {
    return {
      eventId: eventRow.id,
      hasApplication: false,
      capacity: null,
      attendeeCount: 0,
      availableSpots: null,
      eligibleApplicantCount: 0,
      eventHasStarted,
      lifecycle: 'no_application',
      latestWave: null,
      previousWaves: [],
    };
  }

  const [eligibility, waveRows] = await Promise.all([
    getEligibleRsvpApplicants(eventId),
    db
      .select({
        id: schema.eventRsvpWaves.id,
        wave: schema.eventRsvpWaves.wave,
        createdAt: schema.eventRsvpWaves.createdAt,
        respondBy: schema.eventRsvpWaves.respondBy,
      })
      .from(schema.eventRsvpWaves)
      .where(eq(schema.eventRsvpWaves.eventId, eventId))
      .orderBy(desc(schema.eventRsvpWaves.wave)),
  ]);

  if (!eligibility) return null;

  const isFull = eligibility.availableSpots === 0;
  const waveIds = waveRows.map((wave) => wave.id);
  const responseRows =
    waveIds.length === 0
      ? []
      : await db
          .select({
            responseId: schema.eventInvitations.id,
            waveId: schema.eventInvitations.rsvpWaveId,
            userId: schema.user.id,
            name: schema.user.name,
            email: schema.user.email,
            storedLabel: schema.participationStatuses.label,
            respondedAt: schema.eventInvitations.respondedAt,
            termsAcceptedAt: schema.eventInvitations.termsAcceptedAt,
            invitationEmailStatus: schema.eventInvitations.invitationEmailStatus,
          })
          .from(schema.eventInvitations)
          .innerJoin(schema.eventParticipants, eq(schema.eventInvitations.participantId, schema.eventParticipants.id))
          .innerJoin(
            schema.participationStatuses,
            eq(schema.eventParticipants.statusId, schema.participationStatuses.id),
          )
          .innerJoin(schema.user, eq(schema.eventParticipants.userId, schema.user.id))
          .where(inArray(schema.eventInvitations.rsvpWaveId, waveIds));

  const rowsByWaveId = new Map<string, typeof responseRows>();
  for (const row of responseRows) {
    const list = rowsByWaveId.get(row.waveId) ?? [];
    list.push(row);
    rowsByWaveId.set(row.waveId, list);
  }

  const waves = waveRows.map((wave) =>
    summarizeWave({
      id: wave.id,
      wave: wave.wave,
      createdAt: wave.createdAt,
      respondBy: wave.respondBy,
      now,
      rows: rowsByWaveId.get(wave.id) ?? [],
    }),
  );

  const latestWave = waves[0] ?? null;
  const previousWaves = waves.slice(1);

  return {
    eventId: eventRow.id,
    hasApplication: true,
    capacity: eligibility.capacity,
    attendeeCount: eligibility.attendeeCount,
    availableSpots: eligibility.availableSpots,
    eligibleApplicantCount: eligibility.applicants.length,
    eventHasStarted,
    lifecycle: deriveAdminRsvpLifecycle({
      hasApplication: true,
      latestWave,
      isFull,
      eligibleApplicantCount: eligibility.applicants.length,
      eventHasStarted,
      now,
    }),
    latestWave,
    previousWaves,
  };
}
