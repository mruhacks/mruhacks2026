import 'server-only';

import { and, eq, max } from 'drizzle-orm';

import {
  eventRsvpResponses,
  eventRsvpWaves,
  rsvpStatuses,
} from '@/db/schema';
import { db } from '@/utils/db';

export type LatestRsvpResponse = {
  eventId: string;
  responseId: string;
  statusId: number | null;
  statusLabel: string | null;
  respondBy: Date | null;
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
