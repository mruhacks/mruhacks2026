import 'server-only';

import { and, eq, max } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { eventRsvpResponses, eventRsvpWaves, rsvpStatuses } from '@/db/schema';
import type { RsvpUserDecision } from '@/lib/rsvp/constants';
import { db } from '@/utils/db';

export type LatestRsvpResponse = {
  eventId: string;
  responseId: string;
  statusId: number | null;
  statusLabel: string | null;
  respondBy: Date;
  respondedAt: Date | null;
};

/**
 * Latest RSVP response per event for a user (highest wave number).
 *
 * Uses a max(wave) join so list and detail agree even when the user has
 * rows from multiple waves. Optional `eventId` limits to one event.
 */
export async function findLatestRsvpResponses(options: {
  userId: string;
  eventId?: string;
}): Promise<LatestRsvpResponse[]> {
  const filters = [eq(eventRsvpResponses.userId, options.userId)];
  if (options.eventId) {
    filters.push(eq(eventRsvpWaves.eventId, options.eventId));
  }
  const where = and(...filters);

  const latestWave = db
    .select({
      eventId: eventRsvpWaves.eventId,
      maxWave: max(eventRsvpWaves.wave).as('max_wave'),
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .where(where)
    .groupBy(eventRsvpWaves.eventId)
    .as('latest_rsvp_wave');

  return db
    .select({
      eventId: eventRsvpWaves.eventId,
      responseId: eventRsvpResponses.id,
      statusId: eventRsvpResponses.statusId,
      statusLabel: rsvpStatuses.label,
      respondBy: eventRsvpWaves.respondBy,
      respondedAt: eventRsvpResponses.respondedAt,
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .innerJoin(
      latestWave,
      and(
        eq(eventRsvpWaves.eventId, latestWave.eventId),
        eq(eventRsvpWaves.wave, latestWave.maxWave),
      ),
    )
    .leftJoin(rsvpStatuses, eq(eventRsvpResponses.statusId, rsvpStatuses.id))
    .where(where);
}

export async function findLatestRsvpResponse(options: {
  userId: string;
  eventId: string;
}): Promise<LatestRsvpResponse | null> {
  const [row] = await findLatestRsvpResponses(options);
  return row ?? null;
}

export type LatestRsvpResponseForDecision = LatestRsvpResponse & {
  decisionStatusId: number | null;
};

/**
 * Latest RSVP for one event, plus the `rsvp_statuses` id for a user decision
 * (`accepted` / `declined`), in a single round trip.
 */
export async function findLatestRsvpResponseForDecision(options: {
  userId: string;
  eventId: string;
  decision: RsvpUserDecision;
}): Promise<LatestRsvpResponseForDecision | null> {
  const filters = [
    eq(eventRsvpResponses.userId, options.userId),
    eq(eventRsvpWaves.eventId, options.eventId),
  ];
  const where = and(...filters);
  const decisionStatuses = alias(rsvpStatuses, 'decision_rsvp_statuses');

  const latestWave = db
    .select({
      eventId: eventRsvpWaves.eventId,
      maxWave: max(eventRsvpWaves.wave).as('max_wave'),
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .where(where)
    .groupBy(eventRsvpWaves.eventId)
    .as('latest_rsvp_wave');

  const [row] = await db
    .select({
      eventId: eventRsvpWaves.eventId,
      responseId: eventRsvpResponses.id,
      statusId: eventRsvpResponses.statusId,
      statusLabel: rsvpStatuses.label,
      respondBy: eventRsvpWaves.respondBy,
      respondedAt: eventRsvpResponses.respondedAt,
      decisionStatusId: decisionStatuses.id,
    })
    .from(eventRsvpResponses)
    .innerJoin(
      eventRsvpWaves,
      eq(eventRsvpResponses.rsvpWaveId, eventRsvpWaves.id),
    )
    .innerJoin(
      latestWave,
      and(
        eq(eventRsvpWaves.eventId, latestWave.eventId),
        eq(eventRsvpWaves.wave, latestWave.maxWave),
      ),
    )
    .leftJoin(rsvpStatuses, eq(eventRsvpResponses.statusId, rsvpStatuses.id))
    .leftJoin(decisionStatuses, eq(decisionStatuses.label, options.decision))
    .where(where);

  return row ?? null;
}
