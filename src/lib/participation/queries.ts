import 'server-only';

import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { cacheLife } from 'next/cache';

import * as schema from '@/db/schema';
import { db } from '@/utils/db';
import { ATTENDING_STATUS, resolveStoredStatus, type StatusDisplay } from './status';
import type { ParticipationStatus, StatusBadgeVariant } from '@/types/lookups';

/**
 * The `participation_statuses.id` for a label, as an inline subquery — usable
 * in an insert's values, an update's set, or a where clause, so writers never
 * need a separate round trip (or a missing-row branch) to resolve an id.
 */
export function statusIdOf(label: ParticipationStatus): SQL<number> {
  return sql<number>`(SELECT ${schema.participationStatuses.id} FROM ${schema.participationStatuses} WHERE ${schema.participationStatuses.label} = ${label})`;
}

/** `event_participants.status_id = <label>`, for where clauses. */
export function hasStatus(label: ParticipationStatus): SQL {
  return eq(schema.eventParticipants.statusId, statusIdOf(label));
}

/** `event_participants.status_id` is any of `labels`, for where clauses. */
export function hasAnyStatus(labels: readonly ParticipationStatus[]): SQL {
  return inArray(
    schema.eventParticipants.statusId,
    db
      .select({ id: schema.participationStatuses.id })
      .from(schema.participationStatuses)
      .where(inArray(schema.participationStatuses.label, [...labels])),
  );
}

/** `event_participants` holds a spot: `isAttending`, for where and join clauses. */
export function attending(): SQL {
  return hasStatus(ATTENDING_STATUS);
}

/**
 * Number of participants holding a spot (`accepted`) for one event.
 *
 * For a capacity check, pass the transaction and call this only *after* the
 * `events` row is locked `FOR UPDATE`, as its own statement. Under READ
 * COMMITTED a statement that waits on a lock still reads from the snapshot it
 * took before waiting, so a count selected alongside the lock would miss the
 * spot a concurrent transaction just committed and both would claim it.
 */
export async function countAttending(eventId: string, executor: Pick<typeof db, 'select'> = db): Promise<number> {
  const [row] = await executor
    .select({ c: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.eventParticipants)
    .where(and(eq(schema.eventParticipants.eventId, eventId), attending()));
  return row?.c ?? 0;
}

/**
 * Display config for every status, keyed by label. Fixed config that app
 * code never writes, so it's cached long-term rather than re-queried on
 * every render.
 */
export async function getStatusDisplayMap(): Promise<Record<ParticipationStatus, StatusDisplay>> {
  'use cache';
  cacheLife('max');

  const rows = await db
    .select({
      label: schema.participationStatuses.label,
      title: schema.participationStatuses.title,
      description: schema.participationStatuses.description,
      variant: schema.participationStatuses.variant,
    })
    .from(schema.participationStatuses);

  const map = {} as Record<ParticipationStatus, StatusDisplay>;
  for (const row of rows) {
    map[resolveStoredStatus(row.label)] = {
      title: row.title,
      description: row.description,
      variant: row.variant as StatusBadgeVariant,
    };
  }
  return map;
}
